import { Coordinates } from '$lib/location.js';
import { db } from '$lib/database';
import { Interval } from '$lib/interval.js';
import { groupBy, updateValues } from '$lib/collection_utils.js';
import { error, json, type RequestEvent } from '@sveltejs/kit';
import { hoursToMs, minutesToMs } from '$lib/time_utils.js';
import { MAX_TRAVEL_MS, MIN_PREP_MINUTES } from '$lib/constants.js';
import { sql } from 'kysely';
import { covers } from '$lib/sqlHelpers.js';
import { oneToMany } from '$lib/api';

const startAndTargetShareZone = async (from: Coordinates, to: Coordinates) => {
	const zoneContainingStartAndDestination = await db
		.selectFrom('zone')
		.where((eb) => eb.and([eb('zone.is_community', '=', false), covers(eb, from), covers(eb, to)]))
		.executeTakeFirst();
	return zoneContainingStartAndDestination != undefined;
};

export const POST = async (event: RequestEvent) => {
	const customer = event.locals.user;
	if (!customer) {
		return error(403);
	}
	const customerId = customer.id;
	const request = event.request;
	const { from, to, startFixed, timeStamp, numPassengers, numWheelchairs, numBikes, luggage } =
		await request.json();
	const fromCoordinates: Coordinates = from.coordinates;
	const toCoordinates: Coordinates = to.coordinates;
	const time = new Date(timeStamp);

	let travelDuration: number | undefined = 0;
	try {
		travelDuration = (await oneToMany(fromCoordinates, [toCoordinates], false))[0];
		if (travelDuration > MAX_TRAVEL_MS) {
			throw 'keine Route gefunden';
		}
	} catch (e) {
		return json(
			{
				status: 1,
				message: `Es ist ein Fehler im Routing von Start zu Ziel aufgetreten: ${e}.`
			},
			{ status: 404 }
		);
	}

	if (travelDuration == 0) {
		return json({ status: 2, message: 'Start und Ziel sind identisch.' }, { status: 404 });
	}

	if (travelDuration > MAX_TRAVEL_MS) {
		return json(
			{ status: 3, message: 'Die maximale Fahrtzeit wurde überschritten.' },
			{ status: 404 }
		);
	}

	const startTime = startFixed ? time : new Date(time.getTime() - travelDuration);
	const targetTime = startFixed ? new Date(time.getTime() + travelDuration) : time;
	const travelInterval = new Interval(startTime, targetTime);

	if (new Date(Date.now() + minutesToMs(MIN_PREP_MINUTES)) > startTime) {
		return json(
			{ status: 4, message: 'Die Anfrage verletzt die minimale Vorlaufzeit.' },
			{ status: 404 }
		);
	}
	const expandedTravelInterval = travelInterval.expand(hoursToMs(24), hoursToMs(24));

	// Get (unmerged) availabilities which overlap the expanded travel interval,
	// for vehicles which satisfy the zone constraints and the capacity constraints.
	// Also get some other data to reduce number of select calls to db.
	// Use expanded travel interval, to ensure that, if a vehicle is available
	// for the full travel interval (taxicentral-start-target-taxicentral),
	// the corresponding availbilities are already fetched in this select statement.
	const dbResults = await db
		.selectFrom('zone')
		.where((eb) =>
			eb.and([
				eb('zone.is_community', '=', false),
				sql<boolean>`ST_Covers(zone.area, ST_SetSRID(ST_MakePoint(${fromCoordinates.lng}, ${fromCoordinates.lat}),4326))`,
				sql<boolean>`ST_Covers(zone.area, ST_SetSRID(ST_MakePoint(${toCoordinates.lng}, ${toCoordinates.lat}),4326))`
			])
		)
		.innerJoin('company', 'company.zone', 'zone.id')
		.where((eb) =>
			eb.and([
				eb('company.latitude', 'is not', null),
				eb('company.longitude', 'is not', null),
				eb('company.address', 'is not', null),
				eb('company.name', 'is not', null),
				eb('company.zone', 'is not', null),
				eb('company.community_area', 'is not', null)
			])
		)
		.innerJoin(
			(eb) =>
				eb
					.selectFrom('vehicle')
					.selectAll()
					.where((eb) =>
						eb.and([
							eb('vehicle.wheelchair_capacity', '>=', numWheelchairs),
							eb('vehicle.bike_capacity', '>=', numBikes),
							eb('vehicle.seats', '>=', numPassengers),
							eb('vehicle.storage_space', '>=', luggage)
						])
					)
					.as('vehicle'),
			(join) => join.onRef('vehicle.company', '=', 'company.id')
		)
		.innerJoin(
			(eb) =>
				eb
					.selectFrom('availability')
					.selectAll()
					.where((eb) =>
						eb.and([
							eb('availability.start_time', '<=', expandedTravelInterval.endTime),
							eb('availability.end_time', '>=', expandedTravelInterval.startTime)
						])
					)
					.as('availability'),
			(join) => join.onRef('availability.vehicle', '=', 'vehicle.id')
		)
		.select([
			'availability.start_time',
			'availability.end_time',
			'availability.vehicle',
			'company.latitude',
			'company.longitude',
			'company.id as company'
		])
		.execute();

	if (dbResults.length == 0) {
		if (!(await startAndTargetShareZone(fromCoordinates, toCoordinates))) {
			return json(
				{
					status: 5,
					message: 'Start und Ziel sind nicht im selben Pflichtfahrgebiet enthalten.'
				},
				{ status: 404 }
			);
		}
		return json(
			{
				status: 6,
				message:
					'Kein Unternehmen im relevanten Pflichtfahrgebiet hat ein Fahrzeug, das zwischen Start und Ende der Anfrage verfügbar ist.'
			},
			{ status: 404 }
		);
	}

	// Group availabilities by vehicle, merge availabilities corresponding to the same vehicle,
	// filter out availabilities which don't contain the travel-interval (start-target),
	// filter out vehicles which don't have any availabilities left.
	const mergedAvailabilites = groupBy(
		dbResults,
		(element) => element.vehicle,
		(element) => new Interval(element.start_time, element.end_time)
	);
	updateValues(mergedAvailabilites, (entry) =>
		Interval.merge(entry).filter((i) => i.contains(travelInterval))
	);

	console.assert(
		Math.max(...[...mergedAvailabilites.values()].map((availabilities) => availabilities.length)) <=
			1
	);

	const availableVehicles = [...mergedAvailabilites.entries()]
		.filter(([_, availabilities]) => availabilities.length > 0)
		.map(([vehicle, availabilities]) => {
			const db_result = dbResults.find((db_r) => db_r.vehicle == vehicle);
			return {
				latitude: db_result!.latitude,
				longitude: db_result!.longitude,
				company: db_result!.company,
				availability: availabilities[0],
				vehicle
			};
		});

	if (availableVehicles.length == 0) {
		return json(
			{
				status: 7,
				message:
					'Kein Unternehmen im relevanten Pflichtfahrgebiet hat ein Fahrzeug, das zwischen Start und Ende der Anfrage verfügbar ist.'
			},
			{ status: 404 }
		);
	}

	// Group the data of the vehicles which are available during the travel interval by their companies,
	// extract the information needed for the motis-one_to_many requests
	const availableVehiclesByCompany = groupBy(
		availableVehicles,
		(element) => {
			return element.company;
		},
		(element) => {
			return {
				availability: element.availability,
				vehicle: element.vehicle,
				latitude: element.latitude,
				longitude: element.longitude
			};
		}
	);
	const buffer = [...availableVehiclesByCompany];
	const companies = buffer.map(([company, _]) => company);
	const vehicles = buffer.map(([_, vehicles]) => vehicles);
	const centralCoordinates = buffer.map(([company, _]) => {
		const vehicles = availableVehiclesByCompany.get(company);
		console.assert(vehicles && vehicles.length != 0);
		return new Coordinates(vehicles![0].latitude!, vehicles![0].longitude!);
	});

	let durationToStart: Array<number> = [];
	let durationFromTarget: Array<number> = [];
	try {
		durationToStart = await oneToMany(fromCoordinates, centralCoordinates, false);

		durationFromTarget = await oneToMany(toCoordinates, centralCoordinates, true);
	} catch (e) {
		return json({ status: 8, message: `Routing Anfrage fehlgeschlagen: ${e}` }, { status: 500 });
	}
	const fullTravelIntervals = companies.map((_, index) =>
		travelInterval.expand(durationToStart[index], durationFromTarget[index])
	);

	// Filter out vehicles which aren't available for their full-travel-interval (taxicentral-start-target-taxicentral)
	const toRemoveIdxs: number[] = [];
	vehicles.forEach((companyVehicles, index) => {
		if (
			fullTravelIntervals[index].getDurationMs() > hoursToMs(3) ||
			!companyVehicles.some((vehicle) => vehicle.availability.contains(fullTravelIntervals[index]))
		) {
			toRemoveIdxs.push(index);
		}
	});
	toRemoveIdxs.sort((a, b) => b - a);
	toRemoveIdxs.forEach((r) => companies.splice(r, 1));
	toRemoveIdxs.forEach((r) => vehicles.splice(r, 1));
	toRemoveIdxs.forEach((r) => fullTravelIntervals.splice(r, 1));

	const vehicleIds = vehicles.flatMap((vehicles) => vehicles.map((vehicle) => vehicle.vehicle));

	console.assert(
		vehicles.length == fullTravelIntervals.length,
		"In Booking Api, variables vehicles and fullTravelIntervals don't have the same length."
	);
	console.assert(
		vehicles.length == companies.length,
		"In Booking Api, variables vehicles and companies don't have the same length."
	);

	if (vehicleIds.length == 0) {
		return json(
			{
				status: 9,
				message:
					'Kein Unternehmen im relevanten Pflichtfahrgebiet hat ein Fahrzeug, das für die gesamte Tour mit An- und Rückfahrt durchgängig verfügbar ist.'
			},
			{ status: 404 }
		);
	}

	let tourId: number | undefined = undefined;
	let bestVehicle = undefined;

	await db.transaction().execute(async (trx) => {
		sql`LOCK TABLE tour, request, event IN ACCESS EXCLUSIVE MODE;`.execute(trx);
		// Fetch data of tours corresponding to the remaining vehicles
		const viableVehicles = (
			await trx
				.selectFrom('vehicle')
				.where('vehicle.id', 'in', vehicleIds)
				.selectAll()
				.where(({ exists, not, selectFrom }) =>
					not(
						exists(
							selectFrom('tour')
								.select(['tour.arrival', 'tour.departure', 'tour.vehicle'])
								.where((eb) =>
									eb.and([
										eb('tour.vehicle', '=', eb.ref('vehicle.id')),
										eb(
											'tour.departure',
											'<',
											fullTravelIntervals.at(eb.ref('vehicle.company').expressionType!)!.endTime
										),
										eb(
											'tour.arrival',
											'>',
											fullTravelIntervals.at(eb.ref('vehicle.company').expressionType!)!.startTime
										)
									])
								)
						)
					)
				)
				.innerJoin('company', 'company.id', 'vehicle.company')
				.select([
					'vehicle.company',
					'vehicle.id as vehicle',
					'company.name as companyName',
					'company.id as companyId',
					'company.latitude as companyLat',
					'company.longitude as companyLng'
				])
				.execute()
		).map((v) => {
			const companyIdx = companies.indexOf(v.company);
			return {
				companyName: v.companyName,
				companyId: v.companyId,
				companyLat: v.companyLat,
				companyLng: v.companyLng,
				vehicleId: v.vehicle,
				departure: fullTravelIntervals[companyIdx].startTime,
				arrival: fullTravelIntervals[companyIdx].endTime,
				distance: durationToStart[companyIdx] + durationFromTarget[companyIdx]
			};
		});

		if (viableVehicles.length == 0) {
			return;
		}

		// Sort companies by the distance of their taxi-central to start + target
		viableVehicles.sort((a, b) => a.distance - b.distance);
		bestVehicle = viableVehicles[0];

		// Write tour, request, 2 events and if not existant address in db.
		let startAddress = await trx
			.selectFrom('address')
			.where(({ eb }) =>
				eb.and([
					eb('address.city', '=', from.address.city),
					eb('address.house_number', '=', from.address.house_number),
					eb('address.postal_code', '=', from.address.postal_code),
					eb('address.street', '=', from.address.street)
				])
			)
			.select(['id'])
			.executeTakeFirst();
		if (!startAddress) {
			startAddress = (await trx
				.insertInto('address')
				.values({
					street: from.address.street,
					house_number: from.address.house_number,
					postal_code: from.address.postal_code,
					city: from.address.city
				})
				.returning('id')
				.executeTakeFirst())!;
		}
		let targetAddress = await trx
			.selectFrom('address')
			.where(({ eb }) =>
				eb.and([
					eb('address.city', '=', to.address.city),
					eb('address.house_number', '=', to.address.house_number),
					eb('address.postal_code', '=', to.address.postal_code),
					eb('address.street', '=', to.address.street)
				])
			)
			.select(['id'])
			.executeTakeFirst();
		if (!targetAddress) {
			targetAddress = (await trx
				.insertInto('address')
				.values({
					street: to.address.street,
					house_number: to.address.house_number,
					postal_code: to.address.postal_code,
					city: to.address.city
				})
				.returning('id')
				.executeTakeFirst())!;
		}
		tourId = (await trx
			.insertInto('tour')
			.values({
				departure: bestVehicle.departure,
				arrival: bestVehicle.arrival,
				vehicle: bestVehicle.vehicleId!
			})
			.returning('id')
			.executeTakeFirst())!.id;
		const requestId = (await trx
			.insertInto('request')
			.values({
				tour: tourId!,
				passengers: numPassengers,
				bikes: numBikes,
				wheelchairs: numWheelchairs,
				luggage
			})
			.returning('id')
			.executeTakeFirst())!.id;
		await trx
			.insertInto('event')
			.values([
				{
					is_pickup: true,
					latitude: fromCoordinates.lat,
					longitude: fromCoordinates.lng,
					scheduled_time: startTime,
					communicated_time: startTime, // TODO
					address: startAddress.id,
					request: requestId!,
					tour: tourId!,
					customer: customerId
				},
				{
					is_pickup: false,
					latitude: toCoordinates.lat,
					longitude: toCoordinates.lng,
					scheduled_time: targetTime,
					communicated_time: targetTime, // TODO
					address: targetAddress.id,
					request: requestId!,
					tour: tourId!,
					customer: customerId
				}
			])
			.execute();
	});
	if (tourId) {
		return json({
			status: 0,
			companyId: bestVehicle!.companyId!,
			companyLat: bestVehicle!.companyLat!,
			companyLng: bestVehicle!.companyLng!,
			companyName: bestVehicle!.companyName!,
			pickupTime: startTime,
			dropoffTime: targetTime,
			tour_id: tourId,
			message: 'Die Buchung war erfolgreich.'
		});
	}
	return json(
		{
			status: 10,
			message:
				'Kein Fahrzeug ist für die gesamte Fahrtzeit verfügbar und nicht mit anderen Aufträgen beschäftigt.'
		},
		{ status: 404 }
	);
};

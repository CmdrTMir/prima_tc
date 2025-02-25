import { db } from '$lib/server/db';
import { getTours } from '$lib/server/db/getTours.js';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import type { Actions, RequestEvent } from './$types';
import { fail } from '@sveltejs/kit';
import { msg } from '$lib/msg';
import { readInt } from '$lib/server/util/readForm';
import type { UnixtimeMs } from '$lib/util/UnixtimeMs';

export async function load(event) {
	const companyId = event.locals.session?.companyId;
	if (!companyId) {
		throw 'company not defined';
	}

	const url = event.url;
	const localDateParam = url.searchParams.get('date');
	const timezoneOffset = url.searchParams.get('offset');
	const utcDate =
		localDateParam && timezoneOffset
			? new Date(new Date(localDateParam!).getTime() + Number(timezoneOffset) * 60 * 1000)
			: new Date();
	const fromTime = new Date(utcDate);
	fromTime.setHours(utcDate.getHours() - 1);
	const toTime = new Date(utcDate);
	toTime.setHours(utcDate.getHours() + 25);

	const vehicles = db
		.selectFrom('vehicle')
		.where('company', '=', companyId)
		.selectAll()
		.select((eb) => [
			jsonArrayFrom(
				eb
					.selectFrom('availability')
					.whereRef('availability.vehicle', '=', 'vehicle.id')
					.where('availability.startTime', '<', toTime.getTime())
					.where('availability.endTime', '>', fromTime.getTime())
					.select(['availability.id', 'availability.startTime', 'availability.endTime'])
					.orderBy('availability.startTime')
			).as('availability')
		])
		.execute();

	const tours = getTours(false, companyId, [fromTime.getTime(), toTime.getTime()]);

	const company = await db
		.selectFrom('company')
		.where('id', '=', companyId)
		.selectAll()
		.executeTakeFirstOrThrow();

	const companyDataComplete =
		company.name !== null &&
		company.address !== null &&
		company.zone !== null &&
		company.lat !== null &&
		company.lng !== null;

	// HEATMAP
	const heatmapInfos = await db
  		.selectFrom('availability')
  		.innerJoin('vehicle', 'vehicle.id', 'availability.vehicle')
		.where('startTime', '>', toTime.getTime())
		.where('endTime', '<', fromTime.getTime())
		.where('company', '!=', companyId)
		.select(['availability.id','availability.startTime', 'availability.endTime', 'availability.vehicle', 'vehicle.company'])
		.execute();

	
	type Range = {
		startTime: UnixtimeMs;
		endTime: UnixtimeMs;
	};
	type heatinfo = {
		cell: Range;
		heat: number;	
	};
	let heatarray: heatinfo[] = [];
	const split = (range: Range, size: number): Array<Range> => {
		let cells: Array<Range> = [];
		let prev = new Date(range.startTime);
		let t = new Date(range.startTime);
		t.setMinutes(t.getMinutes() + size);
		for (; t.getTime() <= range.endTime; t.setMinutes(t.getMinutes() + size)) {
			cells.push({ startTime: prev.getTime(), endTime: t.getTime() });
			prev = new Date(t);
		}
		return cells;
	};
	const isAInsideB = (rangeA: Range, Bstart: UnixtimeMs, Bend: UnixtimeMs) => {
		return rangeA.startTime >= Bstart && rangeA.startTime < Bend && rangeA.endTime >= Bstart && rangeA.endTime <= Bend; 
	};
	let range: Range = {startTime: toTime.getTime(), endTime: fromTime.getTime()}; 
	let hours = split(range, 60);
	//let indexcount = 0;
	let heatcount = 0;
	for(let hour of hours)
	{
		let cell = split(hour, 15);
		for(let onecell of cell) 
		{
			for(let heat of heatmapInfos) 
			{
				if(isAInsideB(onecell, heat.startTime, heat.endTime)) 
				{
					// das ist noch falsch! ich möchte in heatarray, die cell und die heat (akkumuliert von dem if) speichern, damit ich dann in page 
					// sowohl die cellrange als auch die heat zahl habe
					// wie muss die induzierung von heatarray aussehen?
					heatarray[0] = {cell: onecell, heat: heatcount++}; // hier dann später Berechnung für gewichtete Summe einbauen
				}
			}
			//indexcount++;
		}
		//indexcount++;
	}

	return {
		tours: await tours,
		vehicles: await vehicles,
		heatarray,
		utcDate,
		companyDataComplete,
		companyCoordinates: companyDataComplete
			? {
					lat: company.lat!,
					lng: company.lng!
				}
			: null
	};
}

export const actions: Actions = {
	addVehicle: async (event: RequestEvent) => {
		const company = event.locals.session?.companyId;
		if (!company) {
			throw 'company not defined';
		}

		const formData = await event.request.formData();
		const licensePlate = formData.get('licensePlate');
		const bike = formData.get('bike');
		const wheelchair = formData.get('wheelchair');
		const luggage = readInt(formData.get('luggage'));
		const passengers = readInt(formData.get('passengers'));

		if (passengers !== 3 && passengers !== 5 && passengers !== 7) {
			return fail(400, { msg: msg('invalidSeats') });
		}

		if (
			typeof licensePlate !== 'string' ||
			!/^([A-ZÄÖÜ]{1,3})-([A-ZÄÖÜ]{1,2})-([0-9]{1,4})$/.test(licensePlate)
		) {
			return fail(400, { msg: msg('invalidLicensePlate') });
		}

		if (isNaN(luggage) || luggage <= 0 || luggage >= 11) {
			return fail(400, { msg: msg('invalidStorage') });
		}

		try {
			await db
				.insertInto('vehicle')
				.values({
					licensePlate,
					company,
					passengers,
					luggage,
					wheelchairs: !wheelchair ? 0 : 1,
					bikes: !bike ? 0 : 1
				})
				.execute();
		} catch (e) {
			// @ts-expect-error: 'e' is of type 'unknown'
			if (e.constraint == 'vehicle_license_plate_key') {
				return fail(400, { msg: msg('duplicateLicensePlate') });
			}
			return fail(400, { msg: msg('unkownError') });
		}

		return { msg: msg('vehicleAddedSuccessfully', 'success') };
	}
};

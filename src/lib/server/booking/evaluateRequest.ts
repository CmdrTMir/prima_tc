import { batchOneToManyCarRouting } from '$lib/server/util/batchOneToManyCarRouting';
import { Interval } from '$lib/server/util/interval';
import type { Coordinates } from '$lib/util/Coordinates';
import type { BusStop } from './BusStop';
import type { Capacities } from './Capacities';
import { getPossibleInsertions } from './getPossibleInsertions';
import type { Company } from './getBookingAvailability';
//import type { PromisedTimes } from './PromisedTimes';
import type { Range } from './getPossibleInsertions';
import { gatherRoutingCoordinates, routing } from './routing';
import {
	BUFFER_TIME,
	EARLIEST_SHIFT_START,
	LATEST_SHIFT_END,
	MAX_PASSENGER_WAITING_TIME_DROPOFF,
	MAX_PASSENGER_WAITING_TIME_PICKUP,
	PASSENGER_CHANGE_DURATION
} from '$lib/constants';
import { evaluateNewTours } from './insertion';
import { DAY, HOUR } from '$lib/util/time';
import type { UnixtimeMs } from '$lib/util/UnixtimeMs';

export async function evaluateRequest(
	companies: Company[],
	expandedSearchInterval: Interval,
	userChosen: Coordinates,
	busStops: BusStop[],
	required: Capacities,
	startFixed: boolean
	//promisedTimes?: PromisedTimes
) {
	if (companies.length == 0) {
		return busStops.map((bs) => bs.times.map((_) => undefined));
	}
	const directDurations = (await batchOneToManyCarRouting(userChosen, busStops, startFixed)).map(
		(duration) =>
			duration === undefined ? undefined : duration + PASSENGER_CHANGE_DURATION + BUFFER_TIME
	);
	const insertionRanges = new Map<number, Range[]>();
	companies.forEach((company) =>
		company.vehicles.forEach((vehicle) => {
			insertionRanges.set(vehicle.id, getPossibleInsertions(vehicle, required, vehicle.events));
		})
	);
	const routingResults = await routing(
		companies,
		gatherRoutingCoordinates(companies, insertionRanges),
		userChosen,
		busStops,
		startFixed
	);
	const busStopTimes = busStops.map((bs) =>
		bs.times.map(
			(t) =>
				new Interval(
					startFixed ? t : t - MAX_PASSENGER_WAITING_TIME_PICKUP,
					startFixed ? t + MAX_PASSENGER_WAITING_TIME_DROPOFF : t
				)
		)
	);
	// Find the smallest Interval containing all availabilities and tours of the companies received as a parameter.
	let earliest = Number.MAX_VALUE;
	let latest = 0;
	companies.forEach((c) =>
		c.vehicles.forEach((v) => {
			v.availabilities.forEach((a) => {
				if (a.startTime < earliest) {
					earliest = a.startTime;
				}
				if (a.endTime > latest) {
					latest = a.endTime;
				}
			});
			v.tours.forEach((t) => {
				if (t.departure < earliest) {
					earliest = t.departure;
				}
				if (t.arrival > latest) {
					latest = t.arrival;
				}
			});
		})
	);
	if (earliest >= latest) {
		return busStops.map((bs) => bs.times.map((_) => undefined));
	}
	const allowedTimes = getAllowedTimes(earliest, latest, EARLIEST_SHIFT_START, LATEST_SHIFT_END);
	console.log(
		'WHITELIST REQUEST: ALLOWED TIMES (RESTRICTION FROM 6 TO 21):\n',
		allowedTimes.map((i) => i.toString())
	);
	const newTourEvaluations = evaluateNewTours(
		companies,
		required,
		startFixed,
		expandedSearchInterval,
		busStopTimes,
		routingResults,
		directDurations,
		allowedTimes
		//promisedTimes
	);
	return newTourEvaluations;
}

export function getAllowedTimes(
	earliest: UnixtimeMs,
	latest: UnixtimeMs,
	startOnDay: UnixtimeMs,
	endOnDay: UnixtimeMs
): Interval[] {
	if (earliest >= latest) {
		return [];
	}

	const earliestDay = Math.floor(earliest / DAY) * DAY;
	const latestDay = Math.floor(latest / DAY) * DAY + DAY;

	const noonEarliestDay = new Date(earliestDay + 12 * HOUR);

	const allowedTimes: Array<Interval> = [];
	for (let t = earliestDay; t < latestDay; t += DAY) {
		const offset =
			parseInt(
				noonEarliestDay.toLocaleString('de-DE', {
					hour: '2-digit',
					hour12: false,
					timeZone: 'Europe/Berlin'
				})
			) - 12;
		allowedTimes.push(new Interval(t + startOnDay - offset * HOUR, t + endOnDay - offset * HOUR));
		noonEarliestDay.setHours(noonEarliestDay.getHours() + 24);
	}
	return allowedTimes;
}

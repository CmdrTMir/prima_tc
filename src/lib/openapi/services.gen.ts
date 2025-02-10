//@ts-nocheck
// This file is auto-generated by @hey-api/openapi-ts

import { createClient, createConfig, type Options } from '@hey-api/client-fetch';
import type { OneToManyData, OneToManyError, OneToManyResponse, ReverseGeocodeData, ReverseGeocodeError, ReverseGeocodeResponse, GeocodeData, GeocodeError, GeocodeResponse, TripData, TripError, TripResponse, StoptimesData, StoptimesError, StoptimesResponse, PlanData, PlanError, PlanResponse, TripsData, TripsError, TripsResponse, InitialError, InitialResponse, StopsData, StopsError, StopsResponse, LevelsData, LevelsError, LevelsResponse, FootpathsData, FootpathsError, FootpathsResponse } from './types.gen';

export const client = createClient(createConfig());

/**
 * Street routing from one to many places or many to one.
 * The order in the response array corresponds to the order of coordinates of the \`many\` parameter in the query.
 *
 */
export const oneToMany = <ThrowOnError extends boolean = false>(options: Options<OneToManyData, ThrowOnError>) => { return (options?.client ?? client).get<OneToManyResponse, OneToManyError, ThrowOnError>({
    ...options,
    url: '/api/v1/one-to-many'
}); };

/**
 * Translate coordinates to the closest address(es)/places/stops.
 */
export const reverseGeocode = <ThrowOnError extends boolean = false>(options: Options<ReverseGeocodeData, ThrowOnError>) => { return (options?.client ?? client).get<ReverseGeocodeResponse, ReverseGeocodeError, ThrowOnError>({
    ...options,
    url: '/api/v1/reverse-geocode'
}); };

/**
 * Autocompletion & geocoding that resolves user input addresses including coordinates
 */
export const geocode = <ThrowOnError extends boolean = false>(options: Options<GeocodeData, ThrowOnError>) => { return (options?.client ?? client).get<GeocodeResponse, GeocodeError, ThrowOnError>({
    ...options,
    url: '/api/v1/geocode'
}); };

/**
 * Get a trip as itinerary
 */
export const trip = <ThrowOnError extends boolean = false>(options: Options<TripData, ThrowOnError>) => { return (options?.client ?? client).get<TripResponse, TripError, ThrowOnError>({
    ...options,
    url: '/api/v1/trip'
}); };

/**
 * Get the next N departures or arrivals of a stop sorted by time
 */
export const stoptimes = <ThrowOnError extends boolean = false>(options: Options<StoptimesData, ThrowOnError>) => { return (options?.client ?? client).get<StoptimesResponse, StoptimesError, ThrowOnError>({
    ...options,
    url: '/api/v1/stoptimes'
}); };

/**
 * Computes optimal connections from one place to another.
 */
export const plan = <ThrowOnError extends boolean = false>(options: Options<PlanData, ThrowOnError>) => { return (options?.client ?? client).get<PlanResponse, PlanError, ThrowOnError>({
    ...options,
    url: '/api/v1/plan'
}); };

/**
 * Given a area frame (box defined by top right and bottom left corner) and a time frame,
 * it returns all trips and their respective shapes that operate in this area + time frame.
 * Trips are filtered by zoom level. On low zoom levels, only long distance trains will be shown
 * while on high zoom levels, also metros, buses and trams will be returned.
 *
 */
export const trips = <ThrowOnError extends boolean = false>(options: Options<TripsData, ThrowOnError>) => { return (options?.client ?? client).get<TripsResponse, TripsError, ThrowOnError>({
    ...options,
    url: '/api/v1/map/trips'
}); };

/**
 * initial location to view the map at after loading based on where public transport should be visible
 */
export const initial = <ThrowOnError extends boolean = false>(options?: Options<unknown, ThrowOnError>) => { return (options?.client ?? client).get<InitialResponse, InitialError, ThrowOnError>({
    ...options,
    url: '/api/v1/map/initial'
}); };

/**
 * Get all stops for a map section
 */
export const stops = <ThrowOnError extends boolean = false>(options: Options<StopsData, ThrowOnError>) => { return (options?.client ?? client).get<StopsResponse, StopsError, ThrowOnError>({
    ...options,
    url: '/api/v1/map/stops'
}); };

/**
 * Get all available levels for a map section
 */
export const levels = <ThrowOnError extends boolean = false>(options: Options<LevelsData, ThrowOnError>) => { return (options?.client ?? client).get<LevelsResponse, LevelsError, ThrowOnError>({
    ...options,
    url: '/api/v1/map/levels'
}); };

/**
 * Prints all footpaths of a timetable location (track, bus stop, etc.)
 */
export const footpaths = <ThrowOnError extends boolean = false>(options: Options<FootpathsData, ThrowOnError>) => { return (options?.client ?? client).get<FootpathsResponse, FootpathsError, ThrowOnError>({
    ...options,
    url: '/api/debug/footpaths'
}); };
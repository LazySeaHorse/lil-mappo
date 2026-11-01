import { polyfillFetch } from '@mapbox/search-js-core';

/**
 * The frame's network for searches and directions. The driver registers what
 * the next search should find (the boundary, place or route from the loaded
 * file) before it types; `installFetchMocks` answers Nominatim, Mapbox Search
 * Box, Mapbox Geocoding and Mapbox Directions from that, in the shapes the
 * app's services parse. Those requests never reach the network, even when
 * nothing is registered (they get an empty answer). Everything else (tiles,
 * styles, fonts) passes through.
 */

type LngLat = [number, number];

export interface MockBoundary {
  /** Nominatim `display_name`; the boundary takes its first part as its name. */
  displayName: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  /** Lowercase ISO 3166-1 alpha-2, for countries. */
  countryCode?: string | null;
  type?: string;
}

export interface MockPlace {
  name: string;
  coordinates: LngLat;
  /** The place's context ("Ile-de-France, France"). */
  placeFormatted?: string;
  bbox?: [number, number, number, number];
  featureType?: string;
}

export interface MockRoute {
  start: LngLat;
  end: LngLat;
  geometry: GeoJSON.LineString;
  distance?: number;
  duration?: number;
}

interface Registry {
  boundaries: Array<{ query: string; results: MockBoundary[] }>;
  places: Array<{ query: string; results: MockPlace[] }>;
  routes: MockRoute[];
}

const registry: Registry = { boundaries: [], places: [], routes: [] };

const normalize = (query: string) => query.trim().toLowerCase().replace(/\s+/g, ' ');

/** The next boundary searches for `query` (or the start of it, typed so far) find `results`. */
export function mockBoundarySearch(query: string, results: MockBoundary[]): void {
  registry.boundaries = registry.boundaries.filter((entry) => entry.query !== normalize(query));
  registry.boundaries.push({ query: normalize(query), results });
}

/** Place searches (Search Box suggest/retrieve, Geocoding) for `query` find `results`. */
export function mockPlaceSearch(query: string, results: MockPlace[]): void {
  registry.places = registry.places.filter((entry) => entry.query !== normalize(query));
  registry.places.push({ query: normalize(query), results });
}

/** Driving directions from `start` to `end` follow `geometry`. */
export function mockDirections(route: MockRoute): void {
  registry.routes.push(route);
}

export function clearMocks(): void {
  registry.boundaries = [];
  registry.places = [];
  registry.routes = [];
}

/** The entry for a query: an exact match, else the one whose query the typed text starts. */
function lookup<T>(entries: Array<{ query: string; results: T[] }>, query: string): T[] {
  const typed = normalize(query);
  if (!typed) return [];
  const exact = entries.find((entry) => entry.query === typed);
  if (exact) return exact.results;
  return entries.filter((entry) => entry.query.startsWith(typed)).flatMap((entry) => entry.results);
}

// --- answers -------------------------------------------------------------------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function nominatim(url: URL): Response {
  const results = lookup(registry.boundaries, url.searchParams.get('q') ?? '');
  return json({
    type: 'FeatureCollection',
    features: results.map((r) => ({
      type: 'Feature',
      geometry: r.geometry,
      properties: {
        display_name: r.displayName,
        type: r.type ?? 'administrative',
        extratags: r.countryCode ? { 'ISO3166-1': r.countryCode.toUpperCase() } : {},
      },
    })),
  });
}

/** Place ids are their index in the flat list of places, so retrieve finds them again. */
const allPlaces = () => registry.places.flatMap((entry) => entry.results);
const placeId = (place: MockPlace) => `demo-place-${allPlaces().indexOf(place)}`;

function fullAddress(place: MockPlace): string {
  return [place.name, place.placeFormatted].filter(Boolean).join(', ');
}

function placeProperties(place: MockPlace) {
  const [longitude, latitude] = place.coordinates;
  return {
    name: place.name,
    name_preferred: place.name,
    mapbox_id: placeId(place),
    feature_type: place.featureType ?? 'place',
    full_address: fullAddress(place),
    place_formatted: place.placeFormatted ?? '',
    coordinates: { longitude, latitude },
    context: {},
    ...(place.bbox ? { bbox: place.bbox } : {}),
  };
}

function placeFeature(place: MockPlace) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: place.coordinates },
    ...(place.bbox ? { bbox: place.bbox } : {}),
    properties: placeProperties(place),
  };
}

function searchBox(url: URL): Response {
  const path = url.pathname.replace(/^\/search\/searchbox\/v1\//, '');
  if (path.startsWith('suggest')) {
    const results = lookup(registry.places, url.searchParams.get('q') ?? '');
    return json({
      suggestions: results.map((place) => ({
        ...placeProperties(place),
        address: '',
        language: 'en',
        maki: 'marker',
      })),
      attribution: '',
    });
  }
  if (path.startsWith('retrieve/')) {
    const id = decodeURIComponent(path.slice('retrieve/'.length));
    const place = allPlaces().find((p) => placeId(p) === id);
    return json({ type: 'FeatureCollection', features: place ? [placeFeature(place)] : [], attribution: '' });
  }
  if (path.startsWith('forward')) {
    const results = lookup(registry.places, url.searchParams.get('q') ?? '');
    return json({ type: 'FeatureCollection', features: results.map(placeFeature), attribution: '' });
  }
  // reverse, category: nothing to say.
  return json(path.startsWith('category') || path.startsWith('reverse')
    ? { type: 'FeatureCollection', features: [], attribution: '' }
    : { suggestions: [], attribution: '' });
}

function geocoding(url: URL): Response {
  const query = url.searchParams.get('q') ?? decodeURIComponent(url.pathname.split('/').pop() ?? '').replace(/\.json$/, '');
  const results = lookup(registry.places, query);
  return json({ type: 'FeatureCollection', features: results.map(placeFeature), attribution: '' });
}

const near = (a: LngLat, b: LngLat) => Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4;

function directions(url: URL): Response {
  const coords = decodeURIComponent(url.pathname.split('/').pop() ?? '')
    .split(';')
    .map((pair) => pair.split(',').map(Number) as LngLat);
  const [start, end] = coords;
  if (!start || !end || coords.some((c) => c.some((n) => !Number.isFinite(n)))) {
    return json({ code: 'InvalidInput', message: 'Bad coordinates', routes: [] }, 422);
  }
  const route = registry.routes.find((r) => near(r.start, start) && near(r.end, end));
  // Nothing registered: a straight line, so a route is always found.
  const geometry: GeoJSON.LineString = route?.geometry ?? { type: 'LineString', coordinates: [start, end] };
  return json({
    code: 'Ok',
    routes: [{ geometry, distance: route?.distance ?? 0, duration: route?.duration ?? 0, legs: [], weight: 0 }],
    waypoints: [],
  });
}

/** The mocked answer for a URL, or null when the request should go to the network. */
export function mockedResponse(input: string): Response | null {
  let url: URL;
  try {
    url = new URL(input, window.location.href);
  } catch {
    return null;
  }
  if (url.hostname === 'nominatim.openstreetmap.org') return nominatim(url);
  if (url.hostname !== 'api.mapbox.com') return null;
  if (url.pathname.startsWith('/search/searchbox/')) return searchBox(url);
  if (url.pathname.startsWith('/search/geocode/') || url.pathname.startsWith('/geocoding/')) return geocoding(url);
  if (url.pathname.startsWith('/directions/')) return directions(url);
  return null;
}

const requestUrl = (input: RequestInfo | URL) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

/**
 * Answers search and directions requests from the registry. `@mapbox/search-js-core`
 * keeps its own reference to fetch, so it is handed the mocked one too. Returns
 * the uninstall function.
 */
export function installFetchMocks(win: Window & typeof globalThis = window): () => void {
  const original = win.fetch;
  const mocked: typeof fetch = async (input, init) => {
    const answer = mockedResponse(requestUrl(input));
    if (!answer) return original.call(win, input, init);
    if (init?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
    return answer;
  };
  win.fetch = mocked;
  polyfillFetch({ fetch: mocked, AbortController: win.AbortController }, true);
  return () => {
    if (win.fetch === mocked) win.fetch = original;
    polyfillFetch({ fetch: original, AbortController: win.AbortController }, true);
  };
}

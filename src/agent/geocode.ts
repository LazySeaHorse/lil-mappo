import { getEffectiveMapboxToken } from '@/config/mapbox';
import { useProjectStore } from '@/store/useProjectStore';
import { ToolError } from './errors';
import type { BBox } from './geo';

export interface PlaceResult {
  name: string;
  fullName: string;
  /** [longitude, latitude] */
  coordinates: [number, number];
  /** [west, south, east, north] when the place has an extent (cities, regions, countries). */
  bbox?: BBox;
}

const COORD_PATTERN = /^\s*\[?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]?\s*$/;

/** Parses "lng,lat" (GeoJSON order) or returns null. */
export function parseLngLat(input: string): [number, number] | null {
  const m = COORD_PATTERN.exec(input);
  if (!m) return null;
  const lng = Number(m[1]);
  const lat = Number(m[2]);
  return Math.abs(lng) <= 180 && Math.abs(lat) <= 90 ? [lng, lat] : null;
}

interface GeocodeFeature {
  geometry?: { coordinates?: [number, number] };
  bbox?: number[];
  properties?: {
    name?: string;
    name_preferred?: string;
    full_address?: string;
    place_formatted?: string;
    bbox?: number[];
    coordinates?: { longitude: number; latitude: number };
  };
}

/** Forward geocoding (Mapbox Geocoding v6, non-session), biased to the project's map center. */
export async function searchPlaces(query: string, limit = 5, signal?: AbortSignal): Promise<PlaceResult[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    access_token: getEffectiveMapboxToken(),
  });
  const center = useProjectStore.getState().mapCenter;
  if (center && (center[0] !== 0 || center[1] !== 0)) params.set('proximity', `${center[0]},${center[1]}`);

  let res: Response;
  try {
    res = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params}`, { signal });
  } catch (err) {
    throw new ToolError('network_error', `Place search failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) throw new ToolError('geocode_failed', `Place search failed (HTTP ${res.status}).`);

  const data = (await res.json()) as { features?: GeocodeFeature[] };
  const results: PlaceResult[] = [];
  for (const f of data.features ?? []) {
    const coords = f.geometry?.coordinates ?? (f.properties?.coordinates
      ? [f.properties.coordinates.longitude, f.properties.coordinates.latitude]
      : undefined);
    if (!coords) continue;
    const name = f.properties?.name_preferred ?? f.properties?.name ?? query;
    const bbox = f.bbox ?? f.properties?.bbox;
    results.push({
      name,
      fullName: f.properties?.full_address ?? [name, f.properties?.place_formatted].filter(Boolean).join(', '),
      coordinates: [coords[0], coords[1]],
      ...(bbox && bbox.length === 4 ? { bbox: bbox as BBox } : {}),
    });
  }
  return results;
}

export interface ResolvedPlace {
  coordinates: [number, number];
  /** Display name when the input was a query; undefined for raw coordinates. */
  name?: string;
}

/** Accepts [lng, lat], a "lng,lat" string, or a place query (first geocoding result). */
export async function resolveLocation(input: [number, number] | string): Promise<ResolvedPlace> {
  if (Array.isArray(input)) return { coordinates: input };
  const parsed = parseLngLat(input);
  if (parsed) return { coordinates: parsed };
  const [first] = await searchPlaces(input, 1);
  if (!first) {
    throw new ToolError('place_not_found', `No place found for "${input}". Try search_place with a different query, or pass [lng, lat].`, { query: input });
  }
  return { coordinates: first.coordinates, name: first.name };
}

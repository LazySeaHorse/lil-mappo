import { truncateCoordinates } from '@/engine/geoUtils';
import { historicalDateKey } from '@/engine/historicalDate';
import { parseCountryCode } from '@/services/nominatim';
import type { BoundaryVersion } from '@/store/types';

/** OpenHistoricalMap runs the same Nominatim software as OSM, with dated places. CORS is open. */
const OHM_BASE = 'https://nominatim.openhistoricalmap.org';

/** One period of a historical place found by a search. Carries no outline: that is fetched when a period is chosen. */
export interface HistoricalVersion extends BoundaryVersion {
  /** OHM's "fixme" remarks for this period (for example "needs source for boundary lines"). */
  notes: string[];
}

/** One historical place with all its periods (OHM stores each period as its own relation). */
export interface HistoricalPlace {
  /** English name, as OHM gives it for the first period found. */
  placeName: string;
  /** Stable id of the place within one search: the wikidata id, else name plus kind. */
  groupKey: string;
  /** What kind of place: OHM's address type ("country", "state", "region") or its type. */
  type: string;
  wikidata: string | null;
  /** Oldest first. At least one. */
  versions: HistoricalVersion[];
}

interface OhmSearchItem {
  osm_type?: string;
  osm_id?: number | string;
  name?: string;
  display_name?: string;
  addresstype?: string;
  type?: string;
  extratags?: Record<string, string> | null;
}

/** Oldest start first; a missing start counts as oldest, then the end (a missing end is the latest). */
function compareVersions(a: BoundaryVersion, b: BoundaryVersion): number {
  const start = (historicalDateKey(a.startDate) ?? -Infinity) - (historicalDateKey(b.startDate) ?? -Infinity);
  if (start !== 0 && !Number.isNaN(start)) return start;
  const endA = historicalDateKey(a.endDate) ?? Infinity;
  const endB = historicalDateKey(b.endDate) ?? Infinity;
  return endA === endB ? 0 : endA < endB ? -1 : 1;
}

function dateOrNull(value: string | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function fixmeNotes(extratags: Record<string, string>): string[] {
  return Object.entries(extratags)
    .filter(([key, value]) => (key === 'fixme' || key.startsWith('fixme:')) && typeof value === 'string' && value.trim())
    .map(([, value]) => value.trim());
}

/**
 * Searches OHM and groups the hits into places. Without `dedupe=0` OHM drops a
 * period that shares its name with another, and `accept-language=en` gives
 * "Kingdom of Prussia" rather than the local name. Places keep the order of
 * their first hit (OHM's rank); periods inside a place are sorted by date.
 * Only relations and ways are kept (a node has no outline).
 */
export async function searchHistorical(query: string, signal?: AbortSignal): Promise<HistoricalPlace[]> {
  const url = `${OHM_BASE}/search?q=${encodeURIComponent(query)}&format=json&extratags=1&limit=40&dedupe=0&accept-language=en`;
  const res = await fetch(url, { signal, headers: { 'User-Agent': 'MapStudio/1.0' } });
  if (!res.ok) throw new Error(`OpenHistoricalMap error: ${res.status}`);
  const data = (await res.json()) as OhmSearchItem[];

  const places = new Map<string, HistoricalPlace>();
  for (const item of Array.isArray(data) ? data : []) {
    if (item.osm_type !== 'relation' && item.osm_type !== 'way') continue;
    if (item.osm_id === undefined || item.osm_id === null) continue;
    const extratags = item.extratags ?? {};
    const name = item.name?.trim() || item.display_name?.split(',')[0].trim() || query;
    const kind = item.addresstype || item.type || 'unknown';
    const wikidata = dateOrNull(extratags.wikidata);
    const groupKey = wikidata ?? `${name.toLowerCase()}|${kind}`;
    const version: HistoricalVersion = {
      osmId: `${item.osm_type === 'relation' ? 'R' : 'W'}${item.osm_id}`,
      startDate: dateOrNull(extratags.start_date),
      endDate: dateOrNull(extratags.end_date),
      notes: fixmeNotes(extratags),
    };
    const place = places.get(groupKey);
    if (!place) {
      places.set(groupKey, { placeName: name, groupKey, type: kind, wikidata, versions: [version] });
    } else if (!place.versions.some((v) => v.osmId === version.osmId)) {
      place.versions.push(version);
    }
  }
  const result = [...places.values()];
  for (const place of result) place.versions.sort(compareVersions);
  return result;
}

/** The outline of one period, as a Polygon or MultiPolygon at up to 6 decimals. */
export interface HistoricalOutline {
  geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  /** Lowercase ISO 3166-1 alpha-2 code when OHM has one; usually null. */
  countryCode: string | null;
}

/** Outlines are about 2 MB each, so only a few are kept. */
const OUTLINE_CACHE_SIZE = 8;
const outlineCache = new Map<string, Promise<HistoricalOutline>>();

/** Forgets the remembered outlines (for tests). */
export function clearHistoricalOutlineCache(): void {
  outlineCache.clear();
}

async function loadOutline(osmId: string, signal?: AbortSignal): Promise<HistoricalOutline> {
  const url = `${OHM_BASE}/lookup?osm_ids=${encodeURIComponent(osmId)}&format=geojson&polygon_geojson=1&extratags=1`;
  const res = await fetch(url, { signal, headers: { 'User-Agent': 'MapStudio/1.0' } });
  if (!res.ok) throw new Error(`OpenHistoricalMap error: ${res.status}`);
  const data = (await res.json()) as GeoJSON.FeatureCollection<GeoJSON.Geometry, { extratags?: Record<string, string> | null }>;
  const feature = (data.features || []).find(
    (f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
  );
  if (!feature) throw new Error(`OpenHistoricalMap has no outline for ${osmId}`);
  return {
    geojson: truncateCoordinates(feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon, 6),
    countryCode: parseCountryCode(feature.properties?.extratags),
  };
}

/**
 * Fetches the outline of one period (`osmId` like "R2693579"). The promise is
 * remembered per id, so picking the same period again is instant; a failed
 * fetch is forgotten so the next try starts over. The download is shared and
 * keeps going when a caller aborts (the outline is kept for next time); the
 * aborted caller just stops waiting and gets an AbortError.
 */
export function fetchHistoricalOutline(osmId: string, signal?: AbortSignal): Promise<HistoricalOutline> {
  let pending = outlineCache.get(osmId);
  if (pending) {
    outlineCache.delete(osmId); // re-insert below: most recently used goes last
  } else {
    pending = loadOutline(osmId);
    pending.catch(() => {
      if (outlineCache.get(osmId) === pending) outlineCache.delete(osmId);
    });
  }
  outlineCache.set(osmId, pending);
  while (outlineCache.size > OUTLINE_CACHE_SIZE) outlineCache.delete(outlineCache.keys().next().value as string);
  return signal ? withAbort(pending, signal) : pending;
}

/** Settles with `promise`, or rejects with an AbortError as soon as `signal` aborts. */
function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener('abort', abort); resolve(value); },
      (error) => { signal.removeEventListener('abort', abort); reject(error); },
    );
  });
}

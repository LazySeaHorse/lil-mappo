import { searchBoundary, shortPlaceName } from '@/services/nominatim';
import { searchHistorical, type HistoricalPlace } from '@/services/openHistoricalMap';
import type { SearchBBox } from '@/services/locationSearch';

/** A place as it is today (OpenStreetMap Nominatim), with its outline. */
export interface PresentBoundaryResult {
  kind: 'present';
  /** Short name ("Paris"). */
  placeName: string;
  /** Full Nominatim name ("Paris, Ile-de-France, France"), for the second line of a row. */
  displayName: string;
  type: string;
  geojson: GeoJSON.Geometry;
  /** Lowercase ISO 3166-1 alpha-2 code for countries; null otherwise. */
  countryCode: string | null;
}

/**
 * A place from the past (OpenHistoricalMap) with all its periods and no outline:
 * the outline of the chosen period is fetched with `fetchHistoricalOutline`.
 */
export interface HistoricalBoundaryResult extends HistoricalPlace {
  kind: 'historical';
}

export type BoundarySearchResult = PresentBoundaryResult | HistoricalBoundaryResult;

/** How many of each kind the search returns. */
export const MAX_PRESENT_RESULTS = 5;
export const MAX_HISTORICAL_RESULTS = 8;

/** How long a provider may take before the search goes on without it. */
export const PROVIDER_TIMEOUT_MS = 8000;

/**
 * Runs a provider with the caller's signal plus a deadline. A provider past the deadline is aborted
 * with a TimeoutError (not an AbortError), so it counts as that provider failing, not as the
 * caller giving up.
 */
async function withDeadline<T>(signal: AbortSignal | undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('The provider took too long.', 'TimeoutError')), PROVIDER_TIMEOUT_MS);
  const forward = () => controller.abort(signal?.reason);
  if (signal?.aborted) forward();
  signal?.addEventListener('abort', forward, { once: true });
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forward);
  }
}

const isAbort = (reason: unknown) => reason instanceof DOMException && reason.name === 'AbortError';

/**
 * Searches today's places and historical places together: up to 5 present
 * results first, then up to 8 historical places. One source failing is not an
 * error (the other's results still return), and neither waits longer than
 * `PROVIDER_TIMEOUT_MS` for the other; both failing throws. An abort
 * always throws an AbortError, so callers can ignore a superseded search.
 * `view` only ranks present results nearer the map first.
 */
export async function searchBoundaries(
  query: string,
  signal?: AbortSignal,
  view?: SearchBBox | null,
): Promise<BoundarySearchResult[]> {
  const [present, historical] = await Promise.allSettled([
    withDeadline(signal, (s) => searchBoundary(query, s, view)),
    withDeadline(signal, (s) => searchHistorical(query, s)),
  ]);
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
  for (const outcome of [present, historical]) {
    if (outcome.status === 'rejected' && isAbort(outcome.reason)) throw outcome.reason;
  }
  if (present.status === 'rejected' && historical.status === 'rejected') throw present.reason;

  const results: BoundarySearchResult[] = [];
  if (present.status === 'fulfilled') {
    for (const r of present.value.slice(0, MAX_PRESENT_RESULTS)) {
      results.push({
        kind: 'present',
        placeName: shortPlaceName(r.display_name),
        displayName: r.display_name,
        type: r.type,
        geojson: r.geojson,
        countryCode: r.countryCode,
      });
    }
  }
  if (historical.status === 'fulfilled') {
    for (const place of historical.value.slice(0, MAX_HISTORICAL_RESULTS)) results.push({ kind: 'historical', ...place });
  }
  return results;
}

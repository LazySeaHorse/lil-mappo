import { historicalDateKey, parseHistoricalDate, rangeContainsYear } from '@/engine/historicalDate';
import type { BoundarySource, BoundaryVersion } from '@/store/types';

/**
 * The period of a place that covers `year` (see `rangeContainsYear`: the start
 * year is in, the end year is out). Where periods overlap, the one that
 * started last wins. Null when no period covers the year.
 */
export function pickVersionForYear<T extends BoundaryVersion>(versions: readonly T[], year: number): T | null {
  let best: T | null = null;
  let bestStart = -Infinity;
  for (const version of versions) {
    if (!parseHistoricalDate(version.startDate) && !parseHistoricalDate(version.endDate)) continue; // undated: matches nothing
    if (!rangeContainsYear(version.startDate, version.endDate, year)) continue;
    const start = historicalDateKey(version.startDate) ?? -Infinity;
    if (best === null || start > bestStart) {
      best = version;
      bestStart = start;
    }
  }
  return best;
}

/**
 * The `source` a boundary stores when `version` of a historical place is
 * chosen. Keeps only the dates and ids of every period (no search notes).
 */
export function sourceForVersion(
  place: { wikidata: string | null; versions: readonly BoundaryVersion[] },
  version: BoundaryVersion,
): BoundarySource {
  return {
    provider: 'ohm',
    osmId: version.osmId,
    wikidata: place.wikidata,
    startDate: version.startDate,
    endDate: version.endDate,
    versions: place.versions.map(({ osmId, startDate, endDate }) => ({ osmId, startDate, endDate })),
  };
}

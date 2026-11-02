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

/**
 * The whole span of a place: the earliest start to the latest end. A start that
 * is missing from any period leaves the start unknown (null); an end missing
 * from any period leaves the span open ("present").
 */
export function placeSpan(versions: readonly BoundaryVersion[]): { startDate: string | null; endDate: string | null } {
  let startDate: string | null = null;
  let endDate: string | null = null;
  let startKey = Infinity;
  let endKey = -Infinity;
  let startUnknown = false;
  let endOpen = false;
  for (const version of versions) {
    const start = historicalDateKey(version.startDate);
    const end = historicalDateKey(version.endDate);
    if (start === null) startUnknown = true;
    else if (start < startKey) {
      startKey = start;
      startDate = version.startDate;
    }
    if (end === null) endOpen = true;
    else if (end > endKey) {
      endKey = end;
      endDate = version.endDate;
    }
  }
  return { startDate: startUnknown ? null : startDate, endDate: endOpen ? null : endDate };
}

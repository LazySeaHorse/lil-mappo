import type { HistoricalBoundaryResult } from '@/services/boundarySearch';
import type { HistoricalOutline } from '@/services/openHistoricalMap';

/** A historical place with three periods (oldest first); the middle one carries an OpenHistoricalMap note. */
export const prussia: HistoricalBoundaryResult = {
  kind: 'historical',
  placeName: 'Kingdom of Prussia',
  groupKey: 'Q27306',
  type: 'country',
  wikidata: 'Q27306',
  versions: [
    { osmId: 'R1', startDate: '1701-01-18', endDate: '1815', notes: [] },
    { osmId: 'R2', startDate: '1815', endDate: '1867', notes: ['needs source for boundary lines'] },
    { osmId: 'R3', startDate: '1867', endDate: '1918-11-09', notes: [] },
  ],
};

/** A square per period, each in its own place so the periods can be told apart by their coordinates. */
export const outlineOf = (osmId: string): HistoricalOutline => {
  const x = Number(osmId.slice(1));
  return { geojson: { type: 'Polygon', coordinates: [[[x, 50], [x + 1, 50], [x + 1, 51], [x, 50]]] }, countryCode: null };
};

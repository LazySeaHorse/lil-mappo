import { describe, it, expect } from 'vitest';
import { pickVersionForYear, sourceForVersion } from './historicalSource';

const versions = [
  { osmId: 'R1', startDate: null, endDate: '1701' },
  { osmId: 'R2', startDate: '1701-01-18', endDate: '1867' },
  { osmId: 'R3', startDate: '1867', endDate: '1876' },
  { osmId: 'R4', startDate: '1876', endDate: null },
];

describe('pickVersionForYear', () => {
  it('picks the period that covers the year', () => {
    expect(pickVersionForYear(versions, 1800)?.osmId).toBe('R2');
    expect(pickVersionForYear(versions, 1500)?.osmId).toBe('R1');
    expect(pickVersionForYear(versions, 2000)?.osmId).toBe('R4');
  });

  it('hands over at the boundary year to the newer period', () => {
    expect(pickVersionForYear(versions, 1867)?.osmId).toBe('R3');
    expect(pickVersionForYear(versions, 1876)?.osmId).toBe('R4');
  });

  it('is null when no period covers the year', () => {
    expect(pickVersionForYear([{ osmId: 'R1', startDate: '1800', endDate: '1850' }], 1900)).toBeNull();
    expect(pickVersionForYear([], 1900)).toBeNull();
  });

  it('ignores undated periods and prefers the later start when periods overlap', () => {
    const overlapping = [
      { osmId: 'A', startDate: '1800', endDate: '1900' },
      { osmId: 'B', startDate: '1850', endDate: '1950' },
      { osmId: 'C', startDate: null, endDate: null },
    ];
    expect(pickVersionForYear(overlapping, 1870)?.osmId).toBe('B');
    expect(pickVersionForYear([overlapping[2]], 1870)).toBeNull();
  });

  it('works for BC years', () => {
    const rome = [{ osmId: 'R1', startDate: '-0509', endDate: '-0026' }, { osmId: 'R2', startDate: '-0026', endDate: '0476' }];
    expect(pickVersionForYear(rome, -100)?.osmId).toBe('R1');
    expect(pickVersionForYear(rome, 100)?.osmId).toBe('R2');
  });

  it('returns the same object it was given', () => {
    const withNotes = [{ osmId: 'R1', startDate: '1800', endDate: null, notes: ['x'] }];
    expect(pickVersionForYear(withNotes, 1900)).toBe(withNotes[0]);
  });
});

describe('sourceForVersion', () => {
  it('stores the chosen period and every period, without search notes', () => {
    const place = {
      wikidata: 'Q27306',
      versions: [
        { osmId: 'R1', startDate: '1701', endDate: '1744', notes: ['check'] },
        { osmId: 'R2', startDate: '1744', endDate: null, notes: [] },
      ],
    };
    expect(sourceForVersion(place, place.versions[1])).toEqual({
      provider: 'ohm', osmId: 'R2', wikidata: 'Q27306', startDate: '1744', endDate: null,
      versions: [
        { osmId: 'R1', startDate: '1701', endDate: '1744' },
        { osmId: 'R2', startDate: '1744', endDate: null },
      ],
    });
  });
});

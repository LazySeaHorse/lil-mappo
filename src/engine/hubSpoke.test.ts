import { describe, it, expect } from 'vitest';
import { MAX_SPOKES, placedSpokes, splitPastedPlaces, spokeEndpoints, spokeSchedule } from './hubSpoke';

describe('splitPastedPlaces', () => {
  it('splits lines and keeps commas inside a line', () => {
    expect(splitPastedPlaces('Paris, France\nBerlin\n\n Rome ').entries).toEqual(['Paris, France', 'Berlin', 'Rome']);
  });

  it('splits a single line at commas and semicolons', () => {
    expect(splitPastedPlaces('JFK, LHR; CDG').entries).toEqual(['JFK', 'LHR', 'CDG']);
  });

  it('keeps one coordinate pair whole', () => {
    expect(splitPastedPlaces('-74.006, 40.712').entries).toEqual(['-74.006, 40.712']);
  });

  it('caps the entries and counts the dropped ones', () => {
    const text = Array.from({ length: MAX_SPOKES + 3 }, (_, i) => `Place ${i}`).join('\n');
    const { entries, dropped } = splitPastedPlaces(text);
    expect(entries).toHaveLength(MAX_SPOKES);
    expect(dropped).toBe(3);
  });
});

describe('spokeSchedule', () => {
  it('starts all together', () => {
    expect(spokeSchedule(2, 'together', 4)).toEqual([{ startTime: 4, endTime: 9 }, { startTime: 4, endTime: 9 }]);
  });

  it('places one after another by route length', () => {
    expect(spokeSchedule(3, 'sequence', 0).map((t) => t.startTime)).toEqual([0, 5, 10]);
  });

  it('staggers by the gap', () => {
    expect(spokeSchedule(3, 'staggered', 2, 0.5)).toEqual([
      { startTime: 2, endTime: 7 },
      { startTime: 2.5, endTime: 7.5 },
      { startTime: 3, endTime: 8 },
    ]);
  });
});

describe('spokeEndpoints', () => {
  const spoke = { id: 'a', point: [1, 2] as [number, number], name: 'Paris' };
  it('fans out from the hub', () => {
    expect(spokeEndpoints('end', [5, 6], 'London', spoke)).toMatchObject({ start: [5, 6], startName: 'London', end: [1, 2], endName: 'Paris' });
  });
  it('converges on the hub', () => {
    expect(spokeEndpoints('start', [5, 6], 'London', spoke)).toMatchObject({ start: [1, 2], end: [5, 6], endName: 'London' });
  });
});

describe('placedSpokes', () => {
  it('needs a placed hub and skips blank rows', () => {
    const rows = [{ id: 'a', point: [1, 2] as [number, number], name: '' }, { id: 'b', point: [0, 0] as [number, number], name: '' }];
    expect(placedSpokes(rows, [3, 4])).toHaveLength(1);
    expect(placedSpokes(rows, [0, 0])).toHaveLength(0);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { readMapView, suggestForView, toViewbox } from './locationSearch';

const bounds = (west: number, south: number, east: number, north: number) => ({
  getWest: () => west,
  getSouth: () => south,
  getEast: () => east,
  getNorth: () => north,
});

const fakeMap = (center: [number, number], b: ReturnType<typeof bounds>) => ({
  getCenter: () => ({ lng: center[0], lat: center[1] }),
  getBounds: () => b,
});

describe('readMapView', () => {
  it('returns null without a map', () => {
    expect(readMapView(null)).toBeNull();
    expect(readMapView(undefined)).toBeNull();
  });

  it('reads the live center and visible bounds', () => {
    const view = readMapView(fakeMap([-73.97, 40.78], bounds(-74.1, 40.7, -73.8, 40.9)));
    expect(view).toEqual({ center: [-73.97, 40.78], bbox: [-74.1, 40.7, -73.8, 40.9] });
  });

  it('drops the bounds when they wrap the whole world', () => {
    const view = readMapView(fakeMap([10, 20], bounds(-250, -85, 250, 85)));
    expect(view?.center).toEqual([10, 20]);
    expect(view?.bbox).toBeNull();
  });

  it('drops the bounds when they cross the antimeridian', () => {
    const view = readMapView(fakeMap([179, 0], bounds(170, -10, 190, 10)));
    expect(view?.bbox).toBeNull();
  });

  it('clamps latitude to the valid range', () => {
    const view = readMapView(fakeMap([0, 0], bounds(-60, -95, 60, 95)));
    expect(view?.bbox).toEqual([-60, -90, 60, 90]);
  });
});

describe('toViewbox', () => {
  it('formats a Nominatim viewbox', () => {
    expect(toViewbox([-74.1, 40.7, -73.8, 40.9])).toBe('-74.1,40.9,-73.8,40.7');
  });
});

describe('suggestForView', () => {
  const hit = { suggestions: [{ mapbox_id: 'a' }] };
  const miss = { suggestions: [] };

  it('searches inside the visible bounds first', async () => {
    const suggest = vi.fn().mockResolvedValue(hit);
    const res = await suggestForView({ suggest }, 'Central Park', {
      center: [-73.97, 40.78],
      bbox: [-74.1, 40.7, -73.8, 40.9],
    });
    expect(res).toBe(hit);
    expect(suggest).toHaveBeenCalledTimes(1);
    expect(suggest).toHaveBeenCalledWith('Central Park', {
      proximity: [-73.97, 40.78],
      bbox: [-74.1, 40.7, -73.8, 40.9],
    });
  });

  it('retries once without the bounds when nothing is inside them', async () => {
    const suggest = vi.fn().mockResolvedValueOnce(miss).mockResolvedValueOnce(hit);
    const res = await suggestForView({ suggest }, 'Paris', {
      center: [-73.97, 40.78],
      bbox: [-74.1, 40.7, -73.8, 40.9],
    });
    expect(res).toBe(hit);
    expect(suggest).toHaveBeenCalledTimes(2);
    expect(suggest.mock.calls[1]).toEqual(['Paris', { proximity: [-73.97, 40.78] }]);
  });

  it('never runs more than two queries', async () => {
    const suggest = vi.fn().mockResolvedValue(miss);
    const res = await suggestForView({ suggest }, 'zzzz', { center: [1, 2], bbox: [0, 0, 5, 5] });
    expect(res).toBe(miss);
    expect(suggest).toHaveBeenCalledTimes(2);
  });

  it('runs a single query when there are no bounds', async () => {
    const suggest = vi.fn().mockResolvedValue(miss);
    await suggestForView({ suggest }, 'zzzz', { center: [1, 2], bbox: null });
    expect(suggest).toHaveBeenCalledTimes(1);
    expect(suggest).toHaveBeenCalledWith('zzzz', { proximity: [1, 2] });
  });

  it('does not retry when the first query fails', async () => {
    const suggest = vi.fn().mockRejectedValue(new Error('network'));
    await expect(
      suggestForView({ suggest }, 'x', { center: [1, 2], bbox: [0, 0, 5, 5] }),
    ).rejects.toThrow('network');
    expect(suggest).toHaveBeenCalledTimes(1);
  });

  it('omits proximity when there is no center', async () => {
    const suggest = vi.fn().mockResolvedValue(hit);
    await suggestForView({ suggest }, 'x', { center: undefined, bbox: null });
    expect(suggest).toHaveBeenCalledWith('x', { proximity: undefined });
  });
});

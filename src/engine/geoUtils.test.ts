import { describe, expect, it } from 'vitest';
import { extractLineCoords, facingAlong, geojsonBounds, splitAtAntimeridian } from './geoUtils';
import { getRoutePath } from './routePath';

const feature = (geometry: GeoJSON.Geometry): GeoJSON.Feature => ({ type: 'Feature', properties: {}, geometry });

describe('extractLineCoords', () => {
  it('flattens LineString and MultiLineString and skips other geometry', () => {
    const coords = extractLineCoords({
      features: [
        feature({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }),
        feature({ type: 'MultiLineString', coordinates: [[[2, 2], [3, 3]], [[4, 4]]] }),
        feature({ type: 'Point', coordinates: [9, 9] }),
      ],
    });
    expect(coords).toEqual([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]]);
  });

  it('flattens a very long track without overflowing the call stack', () => {
    const line = Array.from({ length: 200_000 }, (_, i) => [i / 1e4, 0]);
    const multi = Array.from({ length: 200_000 }, (_, i) => [0, i / 1e4]);
    const coords = extractLineCoords({
      features: [
        feature({ type: 'LineString', coordinates: line }),
        feature({ type: 'MultiLineString', coordinates: [multi] }),
      ],
    });
    expect(coords).toHaveLength(400_000);
  });
});

describe('splitAtAntimeridian', () => {
  it('keeps a normal line as a LineString', () => {
    expect(splitAtAntimeridian([[0, 0], [10, 10]])).toEqual({ type: 'LineString', coordinates: [[0, 0], [10, 10]] });
  });

  it('splits where longitude jumps more than 180 degrees', () => {
    const geom = splitAtAntimeridian([[170, 0], [179, 1], [-179, 2], [-170, 3]]);
    expect(geom).toEqual({
      type: 'MultiLineString',
      coordinates: [[[170, 0], [179, 1]], [[-179, 2], [-170, 3]]],
    });
  });
});

describe('geojsonBounds of geometry', () => {
  it('covers every polygon of a MultiPolygon, not just the first', () => {
    const bounds = geojsonBounds({
      type: 'MultiPolygon',
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        [[[50, 40], [60, 40], [60, 45], [50, 40]]],
      ],
    });
    expect(bounds).toEqual([[0, 0], [60, 45]]);
  });

  it('returns null for empty geometry', () => {
    expect(geojsonBounds({ type: 'Polygon', coordinates: [] })).toBeNull();
  });
});

describe('geojsonBounds', () => {
  it('covers every feature of a FeatureCollection', () => {
    const bounds = geojsonBounds({
      type: 'FeatureCollection',
      features: [
        feature({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }),
        feature({ type: 'Point', coordinates: [20, -5] }),
      ],
    });
    expect(bounds).toEqual([[0, -5], [20, 1]]);
  });

  it('reads a single Feature and a bare geometry', () => {
    expect(geojsonBounds(feature({ type: 'Point', coordinates: [3, 4] }))).toEqual([[3, 4], [3, 4]]);
    expect(geojsonBounds({ type: 'LineString', coordinates: [[1, 2], [3, 4]] })).toEqual([[1, 2], [3, 4]]);
  });

  it('returns null when there is nothing to bound', () => {
    expect(geojsonBounds({ type: 'FeatureCollection', features: [] })).toBeNull();
  });
});

describe('facingAlong', () => {
  // Due east for about 1.1 km, wiggling 1 m either side every 10 m, like a traced road.
  const wiggly = getRoutePath(Array.from({ length: 111 }, (_, i) => [i * 0.00009, (i % 2 ? 1 : -1) * 0.000009]));
  const frames = Array.from({ length: 101 }, (_, f) => 0.1 + (0.8 * f) / 100);
  const off = (bearing: number) => Math.abs(bearing - 90);

  it('faces along the road a marker is too small to see the bends of', () => {
    const car = Math.max(...frames.map((u) => off(facingAlong(wiggly, u, 3.4))));
    expect(car).toBeGreaterThan(5);
  });

  it('holds a big marker steady over bends shorter than itself', () => {
    for (const u of frames) expect(off(facingAlong(wiggly, u, 340))).toBeLessThan(0.5);
  });

  it('turns a big marker through a corner over its own length', () => {
    // A right angle from east to north, 2.2 km per leg.
    const corner = getRoutePath([[0, 0], [0.02, 0], [0.02, 0.02]]);
    const at = (u: number) => facingAlong(corner, u, 1000);
    expect(at(0.2)).toBeCloseTo(90, 0);
    expect(at(0.5)).toBeCloseTo(45, 0);
    expect(at(0.8)).toBeCloseTo(0, 0);
    // Half way between the corner and the marker's half length, it is part way round.
    const part = at(0.5 - 250 / corner.lengthM);
    expect(part).toBeGreaterThan(50);
    expect(part).toBeLessThan(85);
  });

  it('ignores a route\'s altitude: the marker never climbs, so it must not tilt', () => {
    const climb = getRoutePath([[0, 0, 0], [0.009, 0, 100], [0.018, 0, 100]]);
    const flat = getRoutePath([[0, 0], [0.009, 0], [0.018, 0]]);
    for (const u of [0.1, 0.25, 0.5, 0.75, 0.9]) expect(facingAlong(climb, u, 10)).toBe(facingAlong(flat, u, 10));
  });

  it('faces a marker longer than the route along the whole of it', () => {
    const short = getRoutePath([[0, 0], [0, 0.0001]]);
    expect(facingAlong(short, 0.5, 5000)).toBeCloseTo(0, 3);
  });
});

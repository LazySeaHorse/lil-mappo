import { describe, expect, it } from 'vitest';
import { extractLineCoords, geometryBounds, splitAtAntimeridian } from './geoUtils';

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

describe('geometryBounds', () => {
  it('covers every polygon of a MultiPolygon, not just the first', () => {
    const bounds = geometryBounds({
      type: 'MultiPolygon',
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        [[[50, 40], [60, 40], [60, 45], [50, 40]]],
      ],
    });
    expect(bounds).toEqual([[0, 0], [60, 45]]);
  });

  it('returns null for empty geometry', () => {
    expect(geometryBounds({ type: 'Polygon', coordinates: [] })).toBeNull();
  });
});

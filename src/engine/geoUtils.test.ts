import { describe, expect, it } from 'vitest';
import { extractLineCoords, geojsonBounds, splitAtAntimeridian } from './geoUtils';

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

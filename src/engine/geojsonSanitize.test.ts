import { describe, expect, it } from 'vitest';
import { sanitizeFeatureCollection, sanitizeLineCoordinates } from './geojsonSanitize';

describe('sanitizeLineCoordinates', () => {
  it('keeps positions whose elevation is missing, dropping only the elevation', () => {
    const coords = [
      [10, 20, 100],
      [10.1, 20.1, null],
      [10.2, 20.2, Number.NaN],
      [10.3, 20.3],
    ];
    expect(sanitizeLineCoordinates(coords)).toEqual([
      [10, 20, 100],
      [10.1, 20.1],
      [10.2, 20.2],
      [10.3, 20.3],
    ]);
  });

  it('drops positions without a finite longitude and latitude', () => {
    expect(sanitizeLineCoordinates([[Number.NaN, 1], [1, null], [1], 'x', [2, 3]])).toEqual([[2, 3]]);
  });
});

describe('sanitizeFeatureCollection', () => {
  it('keeps a GPX-style track intact across elevation gaps', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: null,
        geometry: { type: 'LineString', coordinates: [[0, 0, 5], [1, 1, null as unknown as number], [2, 2, 7]] },
      }],
    };
    const [feature] = sanitizeFeatureCollection(fc).features;
    expect((feature.geometry as GeoJSON.LineString).coordinates).toEqual([[0, 0, 5], [1, 1], [2, 2, 7]]);
    expect(feature.properties).toEqual({});
  });

  it('drops polygon rings with fewer than three usable positions', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [[0, 0], [1, 0], [1, 1], [0, 0]],
            [[0, 0], [Number.NaN, 0], [0, 0]],
          ],
        },
      }],
    };
    const [feature] = sanitizeFeatureCollection(fc).features;
    expect((feature.geometry as GeoJSON.Polygon).coordinates).toHaveLength(1);
  });
});

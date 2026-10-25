import { describe, expect, it } from 'vitest';
import { labelPoint } from './labelPoint';

describe('labelPoint', () => {
  it('finds the middle of a square', () => {
    const [x, y] = labelPoint({ type: 'Polygon', coordinates: [[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]] })!;
    expect(x).toBeCloseTo(1, 1);
    expect(y).toBeCloseTo(1, 1);
  });

  it('stays inside a C shape where the bounding box centre falls in the gap', () => {
    const c: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [[[0, 0], [10, 0], [10, 2], [4, 2], [4, 8], [10, 8], [10, 10], [0, 10], [0, 0]]],
    };
    const [x] = labelPoint(c)!;
    // The bbox centre (5, 5) is in the gap; the pole is in the thick spine on the left.
    expect(x).toBeLessThan(4);
  });

  it('uses the largest polygon of a multipolygon', () => {
    const [x] = labelPoint({
      type: 'MultiPolygon',
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]],
      ],
    })!;
    expect(x).toBeGreaterThan(10);
  });

  it('is null without an area', () => {
    expect(labelPoint(null)).toBeNull();
    expect(labelPoint({ type: 'Point', coordinates: [0, 0] })).toBeNull();
  });
});

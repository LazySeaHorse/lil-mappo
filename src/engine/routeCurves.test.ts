import { describe, it, expect } from 'vitest';
import { buildRouteGeometry, buildRouteFeatureCollection } from './routeCurves';

describe('routeCurves', () => {
  const threePoints: [number, number][] = [
    [-73.9851, 40.7488],
    [-73.9780, 40.7550],
    [-73.9650, 40.7820],
  ];

  it('returns straight line when curved is false', () => {
    const geom = buildRouteGeometry(threePoints, { curved: false });
    expect(geom.type).toBe('LineString');
    expect(geom.coordinates.length).toBe(3);
    expect(geom.coordinates[0]).toEqual(threePoints[0]);
    expect(geom.coordinates[2]).toEqual(threePoints[2]);
  });

  it('falls back to straight line when fewer than 3 points are provided', () => {
    const twoPoints: [number, number][] = [
      [-73.9851, 40.7488],
      [-73.9650, 40.7820],
    ];
    const geom = buildRouteGeometry(twoPoints, { curved: true });
    expect(geom.type).toBe('LineString');
    expect(geom.coordinates.length).toBe(2);
  });

  it('generates a smooth curved spline when curved is true and >= 3 points', () => {
    const geom = buildRouteGeometry(threePoints, { curved: true, sharpness: 0.85 });
    expect(geom.type).toBe('LineString');
    // Curved line should have many interpolated points
    expect(geom.coordinates.length).toBeGreaterThan(3);
    // Starts near start and ends near end
    expect(geom.coordinates[0][0]).toBeCloseTo(threePoints[0][0], 3);
    expect(geom.coordinates[0][1]).toBeCloseTo(threePoints[0][1], 3);
    const lastCoord = geom.coordinates[geom.coordinates.length - 1];
    expect(lastCoord[0]).toBeCloseTo(threePoints[2][0], 3);
    expect(lastCoord[1]).toBeCloseTo(threePoints[2][1], 3);
  });

  it('buildRouteFeatureCollection creates a valid FeatureCollection', () => {
    const fc = buildRouteFeatureCollection(threePoints, { curved: true });
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features.length).toBe(1);
    expect(fc.features[0].geometry.type).toBe('LineString');
  });

  it('safely handles empty or single-point input', () => {
    const emptyGeom = buildRouteGeometry([], { curved: true });
    expect(emptyGeom.coordinates).toEqual([]);

    const singlePointGeom = buildRouteGeometry([[-73.98, 40.75]], { curved: true });
    expect(singlePointGeom.coordinates).toEqual([[-73.98, 40.75]]);
  });
});

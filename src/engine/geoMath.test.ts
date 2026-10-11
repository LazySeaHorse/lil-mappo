import { describe, expect, it } from 'vitest';
import distance from '@turf/distance';
import { point } from '@turf/helpers';
import {
  bearingDeg,
  destinationPoint,
  haversineM,
  latFromMercY,
  lngFromMercX,
  lngLatToMerc,
  mercToLngLat,
  mercX,
  mercY,
  metersPerMerc,
  metersPerPixel,
  wrapDegrees,
} from './geoMath';

// The formulas these helpers replaced, kept here to pin the consolidation to the old results.
const old = {
  flagLatToWorldY(lat: number): number {
    const clamped = Math.max(-85.0511287798, Math.min(85.0511287798, lat));
    const sin = Math.sin((clamped * Math.PI) / 180);
    return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  },
  flagWorldYToLat: (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI,
  demTileXY(lng: number, lat: number, z: number): [number, number] {
    const scale = 2 ** z;
    const phi = (Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180;
    const x = (((lng + 180) / 360) % 1 + 1) % 1 * scale;
    const y = ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * scale;
    return [x, y];
  },
  calculateBearing(start: number[], end: number[]): number {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const toDeg = (v: number) => (v * 180) / Math.PI;
    const φ1 = toRad(start[1]);
    const φ2 = toRad(end[1]);
    const Δλ = toRad(end[0] - start[0]);
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  },
  rigMetersPerPixel: (zoom: number, lat: number) =>
    (40075016.686 / 512) * Math.cos((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180) / 2 ** zoom,
  shortestDelta: (d: number) => ((d + 540) % 360) - 180,
};

// Deterministic pseudo-random points covering the globe.
function points(count: number): [number, number][] {
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  return Array.from({ length: count }, () => [rand() * 360 - 180, rand() * 170 - 85]);
}

describe('geoMath', () => {
  it('mercator y matches the flag fill formula and round-trips', () => {
    for (const lat of [-90, -85.06, -60, -12.3, 0, 0.001, 33.3, 85.05, 90]) {
      expect(mercY(lat)).toBeCloseTo(old.flagLatToWorldY(lat), 12);
      expect(Number.isFinite(mercY(lat))).toBe(true);
    }
    for (const y of [0, 0.1, 0.5, 0.77, 1]) expect(latFromMercY(y)).toBeCloseTo(old.flagWorldYToLat(y), 12);
    for (const [lng, lat] of points(50)) {
      const [x, y] = lngLatToMerc(lng, lat);
      expect(x).toBe(mercX(lng));
      expect(y).toBe(mercY(lat));
      const [lng2, lat2] = mercToLngLat(x, y);
      expect(lng2).toBeCloseTo(lng, 9);
      expect(lat2).toBeCloseTo(lat, 9);
      expect(lngFromMercX(x)).toBe(lng2);
    }
  });

  it('mercator matches the terrain DEM tile formula', () => {
    for (const [lng, lat] of points(50)) {
      for (const z of [2, 7, 12]) {
        const [ox, oy] = old.demTileXY(lng, lat, z);
        const [mx, my] = lngLatToMerc(lng, lat);
        expect(mx * 2 ** z).toBeCloseTo(ox, 8);
        expect(my * 2 ** z).toBeCloseTo(oy, 8);
      }
    }
  });

  it('haversine matches turf distance', () => {
    const pts = points(40);
    for (let i = 1; i < pts.length; i++) {
      const turf = distance(point(pts[i - 1]), point(pts[i]), { units: 'meters' });
      expect(haversineM(pts[i - 1], pts[i])).toBeCloseTo(turf, 6);
    }
  });

  it('bearing matches the geoUtils formula', () => {
    const pts = points(40);
    for (let i = 1; i < pts.length; i++) {
      expect(bearingDeg(pts[i - 1], pts[i])).toBeCloseTo(old.calculateBearing(pts[i - 1], pts[i]), 10);
    }
    expect(bearingDeg([0, 0], [0, 1])).toBe(0);
    expect(bearingDeg([0, 0], [1, 0])).toBeCloseTo(90, 12);
  });

  it('metersPerPixel matches the camera rig formula; metersPerMerc is its zoom-0 scale', () => {
    for (const lat of [-89, -40, 0, 51.5, 89]) {
      for (const zoom of [0, 3.5, 14, 22]) expect(metersPerPixel(zoom, lat)).toBeCloseTo(old.rigMetersPerPixel(zoom, lat), 9);
      expect(metersPerPixel(0, lat) * 512).toBeCloseTo(metersPerMerc(lat), 6);
    }
  });

  it('wrapDegrees agrees with the shortest-delta formula over the range it was used on', () => {
    for (let d = -539.5; d < 900; d += 7.25) expect(wrapDegrees(d)).toBeCloseTo(old.shortestDelta(d), 9);
    expect(wrapDegrees(180)).toBe(-180);
    expect(wrapDegrees(-180)).toBe(-180);
  });

  it('destinationPoint goes the given distance along the bearing', () => {
    const from: [number, number] = [2.35, 48.85];
    const to = destinationPoint(from, 10_000, 45);
    expect(haversineM(from, to)).toBeCloseTo(10_000, 3);
    expect(bearingDeg(from, to)).toBeCloseTo(45, 1);
    expect(destinationPoint([179.99, 0], 10_000, 90)[0]).toBeLessThan(-179);
  });
});

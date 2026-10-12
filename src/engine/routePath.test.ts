import { describe, expect, it } from 'vitest';
import type { AutoCamConfig, CameraKeyframe } from '@/store/types';
import { buildRig, vehicleAt } from './cameraRig';
import { interpolateTwoKeyframes } from './cameraInterpolation';
import { lngLatToMerc } from './cameraPose';
import { getRoutePath } from './routePath';

const diagonal = [[0, 0], [40, 60]];

describe('engine/routePath', () => {
  it('is cached per coordinate array', () => {
    expect(getRoutePath(diagonal)).toBe(getRoutePath(diagonal));
  });

  it('locates a segment and fraction, clamping outside 0..1', () => {
    const path = getRoutePath([[0, 0], [1, 0], [1, 1]]);
    expect(path.locate(0)).toEqual([0, 0]);
    expect(path.locate(0.5)[0]).toBe(1);
    expect(path.locate(0.5)[1]).toBeCloseTo(0, 1);
    expect(path.locate(1)).toEqual([1, 1]);
    expect(path.locate(-3)).toEqual([0, 0]);
    expect(path.locate(7)).toEqual([1, 1]);
  });

  it('survives zero-length segments without NaN', () => {
    const path = getRoutePath([[0, 0], [0, 0], [5, 5], [5, 5], [9, 1], [9, 1]]);
    for (let u = -0.5; u <= 1.5; u += 0.05) {
      expect(path.pointAt(u).every(Number.isFinite)).toBe(true);
      expect(path.slice(0, u).flat().every(Number.isFinite)).toBe(true);
    }
    expect(path.pointAt(0)).toEqual([0, 0]);
    expect(path.pointAt(1)).toEqual([9, 1]);
    const still = getRoutePath([[3, 3], [3, 3]]);
    expect(still.pointAt(0.5)).toEqual([3, 3]);
    expect(still.slice(0, 1)).toEqual([[3, 3], [3, 3]]);
  });

  it('skips non-finite coordinates', () => {
    const path = getRoutePath([[0, 0], [NaN, 3], [10, 0]]);
    expect(path.pointAt(1)).toEqual([10, 0]);
    expect(path.pointAt(0.5)[0]).toBeCloseTo(5, 5);
  });

  it('interpolates in mercator, on the straight line Mapbox draws', () => {
    const path = getRoutePath(diagonal);
    const [lng, lat] = path.pointAt(0.5);
    const [x0, y0] = lngLatToMerc(0, 0);
    const [x1, y1] = lngLatToMerc(40, 60);
    const [mx, my] = lngLatToMerc(lng, lat);
    expect(mx).toBeCloseTo((x0 + x1) / 2, 9);
    expect(my).toBeCloseTo((y0 + y1) / 2, 9);
    // Differs from the lng/lat midpoint (20, 30).
    expect(lng).toBeCloseTo(20, 6);
    expect(Math.abs(lat - 30)).toBeGreaterThan(1);
  });

  it('stays continuous across the antimeridian', () => {
    const path = getRoutePath([[170, 10], [179, 12], [-179, 14], [-170, 16]]);
    for (let i = 1; i < path.x.length; i++) expect(Math.abs(path.x[i] - path.x[i - 1])).toBeLessThan(0.5);
    const [lng] = path.pointAt(0.5);
    expect(Math.abs(lng)).toBeGreaterThan(178);
    for (const u of [0, 0.3, 0.5, 0.7, 1]) {
      const p = path.pointAt(u);
      expect(p[0]).toBeGreaterThanOrEqual(-180);
      expect(p[0]).toBeLessThanOrEqual(180);
    }
  });

  it('keeps altitude', () => {
    const path = getRoutePath([[0, 0, 100], [10, 0, 500], [20, 0, 1000]]);
    expect(path.pointAt(0.5)[2]).toBeCloseTo(500, 3);
    expect(path.pointAt(0.25)[2]).toBeCloseTo(300, 3);
    const seg = path.slice(0.25, 0.75);
    expect(seg).toHaveLength(3);
    expect(seg[1]).toEqual([10, 0, 500]);
    expect(seg[0][2]).toBeCloseTo(300, 3);
  });

  it('slices with interpolated ends and the original vertices between', () => {
    const route = [[0, 0], [10, 0], [10, 10], [20, 10]];
    const seg = getRoutePath(route).slice(0.1, 0.9);
    expect(seg[1]).toBe(route[1]);
    expect(seg[2]).toBe(route[2]);
    expect(seg).toHaveLength(4);
    expect(getRoutePath(route).slice(0.8, 0.2)).toEqual([]);
  });
});

describe('route geometry agreement', () => {
  const config = { mode: 'cinematic', distance: 400, smoothing: 0.5, lookAhead: 100, zoom: 15 } as unknown as AutoCamConfig;
  const timing = { duration: 5, easing: 'linear' as const };

  it('places the rig vehicle exactly where pointAt does, across the antimeridian too', () => {
    for (const route of [
      [[0, 0], [0.001, 0], [0.02, 0.0], [0.02, 0.02], [0.03, 0.02]],
      [[0, 0], [0, 0], [30, 50], [31, 52]],
      [[179.99, 10], [-179.99, 10.01], [-179.9, 10.02]],
    ]) {
      const rig = buildRig(route, config, timing)!;
      const path = getRoutePath(route);
      for (const u of [0, 0.1, 0.37, 0.5, 0.83, 1]) {
        const [vx, vy] = vehicleAt(rig, u);
        const [lng, lat] = path.pointAt(u);
        const [px, py] = lngLatToMerc(lng, lat);
        const dx = Math.abs(vx - px);
        expect(Math.min(dx, Math.abs(dx - 1))).toBeLessThan(1e-9);
        expect(Math.abs(vy - py)).toBeLessThan(1e-9);
      }
    }
  });

  it('centres a follow-route keyframe on pointAt', () => {
    const route = [[0, 0], [10, 40], [30, 45]];
    const kf = (time: number, followRoute: string | null): CameraKeyframe => ({
      id: `k${time}`, time, camera: { center: [0, 0], zoom: 5, pitch: 0, bearing: 0, altitude: null }, easing: 'linear', followRoute,
    });
    const cam = interpolateTwoKeyframes(kf(0, null), kf(10, 'r'), 0.4, () => route);
    const [lng, lat] = getRoutePath(route).pointAt(0.4);
    expect(cam.center[0]).toBeCloseTo(lng, 9);
    expect(cam.center[1]).toBeCloseTo(lat, 9);
  });
  describe('lineProgressAt (Mapbox line-progress of geodesic progress)', () => {
    const bent = [[0, 0], [10, 70], [20, 0], [30, 5]];

    it('maps the ends to the ends and is monotonic', () => {
      const path = getRoutePath(bent);
      expect(path.lineProgressAt(0)).toBe(0);
      expect(path.lineProgressAt(1)).toBe(1);
      expect(path.lineProgressAt(-2)).toBe(0);
      expect(path.lineProgressAt(9)).toBe(1);
      let prev = 0;
      for (let u = 0; u <= 1; u += 0.01) {
        const v = path.lineProgressAt(u);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    });

    it('equals the mercator cumulative fraction at the vertices', () => {
      const path = getRoutePath(bent);
      const cum = [0];
      for (let i = 1; i < bent.length; i++) cum.push(cum[i - 1] + Math.hypot(path.x[i] - path.x[i - 1], path.y[i] - path.y[i - 1]));
      path.u.forEach((u, i) => expect(path.lineProgressAt(u)).toBeCloseTo(cum[i] / cum[cum.length - 1], 12));
    });

    it('differs from geodesic progress on a route spanning a large latitude range', () => {
      const path = getRoutePath([[0, 0], [0, 10], [0, 80]]);
      expect(path.u[1]).toBeCloseTo(0.125, 2);
      expect(path.lineProgressAt(path.u[1])).toBeCloseTo(0.072, 2);
    });

    it('is continuous across the antimeridian', () => {
      const path = getRoutePath([[170, 0], [-170, 0]]);
      expect(path.lineProgressAt(0.5)).toBeCloseTo(0.5, 9);
    });

    it('is 0 for a path with no mercator length', () => {
      expect(getRoutePath([[3, 3], [3, 3]]).lineProgressAt(0.5)).toBe(0);
    });
  });
});

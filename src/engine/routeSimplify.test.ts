import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  optimizeGeometry,
  metersToDegrees,
  IMPORTED_ROUTE_TOLERANCE_M,
  IMPORTED_ROUTE_VERTICAL_TOLERANCE_M,
  ROUTE_SIMPLIFY_TOLERANCE_M,
  simplifyLine,
} from './geoUtils';
import { getDirections } from '@/services/directions';
import { calculateFlightArc } from '@/services/flightPath';
import { syntheticRoad, maxDeviationMeters, decimals } from '@/test/syntheticGeometry';

const line = (coordinates: number[][]): GeoJSON.LineString => ({ type: 'LineString', coordinates });

describe('metersToDegrees', () => {
  it('uses ~111,320 m per degree', () => {
    expect(metersToDegrees(111_320)).toBeCloseTo(1, 9);
    expect(metersToDegrees(0.5)).toBeCloseTo(0.5 / 111_320, 12);
  });
});

describe('route cleanup via optimizeGeometry({ toleranceM })', () => {
  const road = syntheticRoad();

  it('has a 0.5 m route tolerance constant', () => {
    expect(ROUTE_SIMPLIFY_TOLERANCE_M).toBe(0.5);
  });

  it('drops redundant vertices but stays within tolerance of every original vertex', () => {
    const out = optimizeGeometry(line(road), { toleranceM: 0.5, precision: 6 });
    expect(out.coordinates.length).toBeLessThan(road.length * 0.5);
    expect(out.coordinates.length).toBeGreaterThan(10);
    expect(maxDeviationMeters(road, out.coordinates)).toBeLessThanOrEqual(0.5 + 0.1);
  });

  it('keeps endpoints and at most 6 decimals', () => {
    const out = optimizeGeometry(line(road), { toleranceM: 0.5, precision: 6 });
    expect(out.coordinates[0]).toEqual(road[0]);
    expect(out.coordinates[out.coordinates.length - 1]).toEqual(road[road.length - 1]);
    for (const c of out.coordinates) for (const v of c) expect(decimals(v)).toBeLessThanOrEqual(6);
  });

  it('simplifies lines that carry altitude without flattening the climb', () => {
    // Straight along the ground, up to a peak at vertex 25 and back down: in 2D every middle vertex
    // would go, in 3D the peak must stay.
    const climb = Array.from({ length: 51 }, (_, i) => [i * 0.001, 0, i <= 25 ? i * 100 : (50 - i) * 100]);
    const out = optimizeGeometry(line(climb), { toleranceM: 0.5, precision: 6 });
    expect(out.coordinates).toEqual([[0, 0, 0], [0.025, 0, 2500], [0.05, 0, 0]]);
  });
});

describe('simplifyLine', () => {
  it('drops points along a flat straight road even when every point has an altitude', () => {
    const flat = Array.from({ length: 1000 }, (_, i) => [i * 1e-5, 45, 120]);
    expect(simplifyLine(flat, 1)).toEqual([flat[0], flat[999]]);
  });

  it('keeps a vertex whose altitude alone is off the line by more than the tolerance', () => {
    const bump = [[0, 0, 0], [0.0001, 0, 2], [0.0002, 0, 0]];
    expect(simplifyLine(bump, 1)).toHaveLength(3);
    expect(simplifyLine(bump, 3)).toHaveLength(2);
  });

  it('bounds altitude by its own tolerance when given one', () => {
    // A 3 m altitude wobble on a straight road: kept at a 1 m vertical bound, dropped at 5 m.
    const wobble = [[0, 0, 100], [0.0001, 0, 103], [0.0002, 0, 100]];
    expect(simplifyLine(wobble, 1)).toHaveLength(3);
    expect(simplifyLine(wobble, 1, 5)).toHaveLength(2);
    // The horizontal bound still holds.
    const corner = [[0, 0, 100], [0.0001, 2 / 111_320, 100], [0.0002, 0, 100]];
    expect(simplifyLine(corner, 1, 5)).toHaveLength(3);
  });

  it('keeps a real climb at the imported-route vertical tolerance', () => {
    const climb = [[0, 0, 0], [0.01, 0, 80], [0.02, 0, 0]];
    expect(simplifyLine(climb, IMPORTED_ROUTE_TOLERANCE_M, IMPORTED_ROUTE_VERTICAL_TOLERANCE_M)).toHaveLength(3);
  });

  it('measures east-west in true metres away from the equator', () => {
    // A north-south line with its middle vertex 2e-5° of longitude east: ~1.1 m at 60°N, ~2.2 m at
    // the equator.
    const bend = (lat: number) => [[0, lat], [2e-5, lat + 0.001], [0, lat + 0.002]];
    expect(simplifyLine(bend(60), 1.5)).toHaveLength(2);
    expect(simplifyLine(bend(0), 1.5)).toHaveLength(3);
  });

  it('treats an antimeridian crossing as a short step', () => {
    const crossing = Array.from({ length: 41 }, (_, i) => {
      const lng = 179.9998 + i * 1e-5;
      return [lng > 180 ? lng - 360 : lng, -16];
    });
    const out = simplifyLine(crossing, 1);
    expect(out).toEqual([crossing[0], crossing[40]]);
  });

  it('keeps a loop that starts and ends at the same spot', () => {
    const loop = Array.from({ length: 361 }, (_, i) => {
      const a = (i * Math.PI) / 180;
      return [0.001 * Math.cos(a), 0.001 * Math.sin(a)];
    });
    loop[360] = loop[0];
    const out = simplifyLine(loop, 1);
    expect(out[0]).toBe(loop[0]);
    expect(out[out.length - 1]).toBe(loop[0]);
    expect(out.length).toBeGreaterThan(10);
    expect(out.length).toBeLessThan(361);
    expect(maxDeviationMeters(loop, out)).toBeLessThanOrEqual(1);
  });

  it('returns the same array when nothing can go', () => {
    const zigzag = [[0, 0], [0.001, 0.001], [0.002, 0]];
    expect(simplifyLine(zigzag, 1)).toBe(zigzag);
    expect(simplifyLine(zigzag.slice(0, 2), 1)).toEqual(zigzag.slice(0, 2));
  });

  it('handles a 200k-point recording that curls ever tighter', () => {
    const n = 200_000;
    const spiral = Array.from({ length: n }, (_, i) => {
      const a = Math.sqrt(i) * 0.5;
      const r = 0.05 / (1 + i / 1000);
      return [r * Math.cos(a), 45 + r * Math.sin(a), 100 + Math.sin(i / 50) * 5];
    });
    const out = simplifyLine(spiral, 1);
    expect(out[0]).toBe(spiral[0]);
    expect(out[out.length - 1]).toBe(spiral[n - 1]);
    expect(out.length).toBeLessThan(n);
  });
});

describe('services use 6dp + sub-metre cleanup', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('getDirections cleans the Mapbox geometry', async () => {
    const road = syntheticRoad();
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ routes: [{ distance: 1, duration: 1, geometry: line(road) }] }))));
    const res = await getDirections([0, 0], [1, 1]);
    expect(res.geometry.coordinates.length).toBeLessThan(road.length * 0.5);
    expect(maxDeviationMeters(road, res.geometry.coordinates)).toBeLessThanOrEqual(0.6);
    // Not snapped to the old 4dp (~11 m) grid
    expect(res.geometry.coordinates.some((c) => decimals(c[0]) > 4)).toBe(true);
  });

  it('calculateFlightArc stores 6dp, not 4dp', () => {
    const arc = calculateFlightArc([-9.1393, 38.7223], [2.3522, 48.8566]);
    expect(arc.coordinates.some((c) => decimals(c[0]) > 4 || decimals(c[1]) > 4)).toBe(true);
    for (const c of arc.coordinates) for (const v of c) expect(decimals(v)).toBeLessThanOrEqual(6);
  });

  it('calculateFlightArc survives identical endpoints', () => {
    const arc = calculateFlightArc([10, 10], [10, 10]);
    expect(arc.coordinates.length).toBeGreaterThanOrEqual(2);
  });
});

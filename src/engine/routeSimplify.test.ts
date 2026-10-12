import { describe, it, expect, vi, afterEach } from 'vitest';
import { optimizeGeometry, metersToDegrees, ROUTE_SIMPLIFY_TOLERANCE_M } from './geoUtils';
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

  it('skips simplification for lines that carry altitude (2D Douglas-Peucker would flatten the profile)', () => {
    const climb = Array.from({ length: 50 }, (_, i) => [i * 0.001, 0, i < 25 ? i * 100 : (50 - i) * 100]);
    const out = optimizeGeometry(line(climb), { toleranceM: 0.5, precision: 6 });
    expect(out.coordinates).toHaveLength(50);
    expect(out.coordinates[24][2]).toBe(2400);
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

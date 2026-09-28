import { describe, expect, it } from 'vitest';
import type { RouteItem } from '@/store/types';
import { applyFreeformPatch, isFreeformRoute } from './routeCurves';

const route = (calc: Partial<NonNullable<RouteItem['calculation']>> = {}): RouteItem => ({
  kind: 'route',
  id: 'r1',
  name: 'Trail',
  geojson: { type: 'FeatureCollection', features: [] },
  startTime: 0,
  endTime: 10,
  style: {
    color: '#fff', width: 4, glow: false, glowColor: '#fff', glowWidth: 12,
    trailFade: false, trailFadeLength: 0.3, dashPattern: null,
  },
  easing: 'linear',
  calculation: { mode: 'manual', startPoint: [0, 0], endPoint: [0, 0], ...calc },
});

const coordsOf = (patch: Partial<RouteItem>) =>
  (patch.geojson!.features[0].geometry as GeoJSON.LineString).coordinates;

describe('applyFreeformPatch', () => {
  it('keeps the existing geometry until two points are placed', () => {
    const r = route();
    expect(applyFreeformPatch(r, { startPoint: [10, 10] }).geojson).toBe(r.geojson);
  });

  it('builds a straight line through start, waypoints, and end when not curved', () => {
    const patch = applyFreeformPatch(route({ startPoint: [0, 1], endPoint: [2, 1] }), {
      waypoints: [[1, 2]],
      curved: false,
    });
    expect(coordsOf(patch)).toEqual([[0, 1], [1, 2], [2, 1]]);
    expect(patch.calculation).toMatchObject({ curved: false, waypoints: [[1, 2]] });
  });

  it('curves by default and stores the defaults explicitly', () => {
    const patch = applyFreeformPatch(route({ startPoint: [0, 1], endPoint: [2, 1] }), { waypoints: [[1, 2]] });
    expect(coordsOf(patch).length).toBeGreaterThan(3);
    expect(patch.calculation).toMatchObject({ curved: true, sharpness: 0.85 });
  });

  it('skips unplaced points', () => {
    const patch = applyFreeformPatch(route({ startPoint: [0, 1] }), { waypoints: [[1, 2]], curved: false });
    expect(coordsOf(patch)).toEqual([[0, 1], [1, 2]]);
  });
});

describe('isFreeformRoute', () => {
  it('recognises manual mode, curve settings, and waypoints', () => {
    expect(isFreeformRoute(undefined)).toBe(false);
    expect(isFreeformRoute(route({ mode: 'car' }).calculation)).toBe(false);
    expect(isFreeformRoute(route({ mode: 'manual' }).calculation)).toBe(true);
    expect(isFreeformRoute(route({ mode: 'walk', curved: false }).calculation)).toBe(true);
    expect(isFreeformRoute(route({ mode: 'walk', waypoints: [[1, 1]] }).calculation)).toBe(true);
  });
});

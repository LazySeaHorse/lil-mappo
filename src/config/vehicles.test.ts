import { describe, expect, it } from 'vitest';
import distance from '@turf/distance';
import { point } from '@turf/helpers';
import type { RouteItem } from '@/store/types';
import { clampVehicleScale, effectiveAutoCam, followDistanceFactor, autoCamForRoute, autoCamPresetPatch, defaultAutoCamFor, getAutoCamRanges, rescaleAutoCam, routeFitOf, vehicleChangePatch } from './vehicles';

const route = (type: 'car' | 'plane' | 'dot', autoCam?: RouteItem['autoCam']): RouteItem => ({
  kind: 'route',
  id: 'r1',
  name: 'Route',
  geojson: { type: 'FeatureCollection', features: [] },
  startTime: 0,
  endTime: 10,
  style: {
    color: '#fff', width: 4, glow: false, glowWidth: 12,
    dashPattern: null, animationType: 'draw', cometTrailLength: 0.2,
  },
  easing: 'linear', exitAnimation: 'none',
  calculation: {
    mode: 'car',
    startPoint: [0, 0],
    endPoint: [1, 1],
    startName: '',
    endName: '',
    vehicle: { enabled: true, type, modelId: '', scale: 1 },
  },
  autoCam,
});

describe('auto-camera ranges', () => {
  it('scales plane ranges and defaults with the plane model', () => {
    expect(getAutoCamRanges('car').distance).toEqual({ min: 100, max: 25000, step: 50 });
    expect(getAutoCamRanges('plane').distance).toEqual({ min: 10000, max: 2500000, step: 5000 });
    expect(defaultAutoCamFor('car').distance).toBe(600);
    expect(defaultAutoCamFor('plane').distance).toBe(60000);
    expect(defaultAutoCamFor('plane').pitch).toBe(defaultAutoCamFor('car').pitch);
  });

  it('keeps defaults inside their ranges', () => {
    for (const type of ['car', 'plane', 'dot'] as const) {
      const d = defaultAutoCamFor(type);
      const r = getAutoCamRanges(type);
      expect(d.distance).toBeGreaterThanOrEqual(r.distance.min);
      expect(d.distance).toBeLessThanOrEqual(r.distance.max);
    }
  });
});

describe('rescaleAutoCam', () => {
  it('scales framing up and back down without drift', () => {
    const car = defaultAutoCamFor('car');
    const plane = rescaleAutoCam(car, 'car', 'plane');
    expect(plane.distance).toBe(60000);
    expect(rescaleAutoCam(plane, 'plane', 'car')).toEqual(car);
  });

  it('treats car and dot alike', () => {
    const car = defaultAutoCamFor('car');
    expect(rescaleAutoCam(car, 'car', 'dot')).toBe(car);
  });

  it('clamps into the target range', () => {
    const tooFar = { ...defaultAutoCamFor('plane'), distance: 2500000 * 2 };
    expect(rescaleAutoCam(tooFar, 'plane', 'car').distance).toBe(25000);
  });
});

describe('vehicleChangePatch', () => {
  it('rescales the auto-camera when switching to a plane', () => {
    const patch = vehicleChangePatch(route('car', defaultAutoCamFor('car')), route('car').calculation!, {
      enabled: true, type: 'plane', modelId: '', scale: 1,
    });
    expect(patch.calculation?.vehicle?.type).toBe('plane');
    expect(patch.autoCam?.distance).toBe(60000);
  });

  it('rescales even while the auto-camera is disabled, so re-enabling is correct', () => {
    const disabled = { ...defaultAutoCamFor('plane'), enabled: false };
    const patch = vehicleChangePatch(route('plane', disabled), route('plane').calculation!, {
      enabled: true, type: 'car', modelId: '', scale: 1,
    });
    expect(patch.autoCam).toMatchObject({ enabled: false, distance: 600 });
  });

  it('leaves routes without an auto-camera alone', () => {
    const patch = vehicleChangePatch(route('car'), route('car').calculation!, {
      enabled: true, type: 'plane', modelId: '', scale: 1,
    });
    expect(patch).not.toHaveProperty('autoCam');
  });
});

describe('fitting the auto-camera to the route', () => {
  it('keeps the default framing for a route that plays slowly', () => {
    expect(autoCamPresetPatch('chase', 'car', { lengthM: 2000, duration: 30 })).toMatchObject({ distance: 600, pitch: 60 });
  });

  it('pulls back so a long, fast route reads at its pace', () => {
    // 87 km in 15 s: the vehicle crosses the shot in about two seconds.
    const fit = autoCamPresetPatch('chase', 'car', { lengthM: 87000, duration: 15 });
    expect(fit.distance! / (87000 / 15)).toBeCloseTo(2, 1);
    expect(fit.distance! % 50).toBe(0);
  });

  it('keeps each preset\'s shape and stays in range', () => {
    const chase = autoCamPresetPatch('chase', 'car', { lengthM: 87000, duration: 15 });
    const drone = autoCamPresetPatch('drone', 'car', { lengthM: 87000, duration: 15 });
    expect(drone.pitch!).toBeLessThan(chase.pitch!);
    expect(drone.distance!).toBeGreaterThan(chase.distance!);
    const extreme = autoCamPresetPatch('topdown', 'car', { lengthM: 1e7, duration: 1 });
    expect(extreme.distance).toBe(getAutoCamRanges('car').distance.max);
  });

  it('fits a newly enabled auto-camera to its route', () => {
    const r = route('car');
    r.geojson = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[8, 46], [8, 46.8]] } }],
    };
    r.endTime = 15;
    const cam = autoCamForRoute(r);
    expect(cam).toMatchObject({ enabled: true, preset: 'chase' });
    expect(cam.distance).toBeGreaterThan(5000);
  });
});

describe('routeFitOf', () => {
  const line = (...lines: number[][][]): RouteItem['geojson'] => ({
    type: 'FeatureCollection',
    features: lines.map((coordinates) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } })),
  });
  const turfLength = (coords: number[][]) =>
    coords.slice(1).reduce((sum, c, i) => sum + distance(point(coords[i]), point(c), { units: 'meters' }), 0);

  it('measures the route the way summing turf distances did', () => {
    const cases = [
      [[8, 46], [8, 46.8]],
      [[2.35, 48.85], [13.4, 52.52], [-0.12, 51.5], [-0.12, 51.5], [151.2, -33.87]],
      [[179.5, 10], [-179.5, 10.5], [-178, 11]],
      [[0, 0]],
      [],
    ];
    for (const coords of cases) {
      const fit = routeFitOf({ geojson: line(coords), startTime: 2, endTime: 12 });
      expect(fit.duration).toBe(10);
      expect(fit.lengthM).toBeCloseTo(turfLength(coords), 4);
    }
  });

  it('measures several lines as one, joined end to start', () => {
    const a = [[0, 0], [1, 0]];
    const b = [[1, 1], [2, 1]];
    const fit = routeFitOf({ geojson: line(a, b), startTime: 0, endTime: 1 });
    expect(fit.lengthM).toBeCloseTo(turfLength([...a, ...b]), 4);
  });
});

describe('clampVehicleScale', () => {
  it('limits each marker type to its own range', () => {
    expect(clampVehicleScale('car', 8000)).toBe(8000);
    expect(clampVehicleScale('car', 99999)).toBe(10000);
    expect(clampVehicleScale('plane', 8000)).toBe(50);
    expect(clampVehicleScale('dot', 8000)).toBe(10);
    expect(clampVehicleScale('car', 0.01)).toBe(0.2);
    expect(clampVehicleScale(undefined, 3)).toBe(3);
  });
});

describe('follow camera and marker size', () => {
  const cam = (type: 'car' | 'plane' | 'dot', scale: number, enabled = true): RouteItem => ({
    ...route(type, defaultAutoCamFor(type)),
    calculation: { mode: 'walk', points: [], curved: false, sharpness: 0, vehicle: { enabled, type, modelId: '', scale } },
  } as RouteItem);

  it('pulls back in step with an enlarged 3D marker only', () => {
    expect(followDistanceFactor(cam('car', 40).calculation!.vehicle)).toBe(40);
    expect(followDistanceFactor(cam('car', 0.5).calculation!.vehicle)).toBe(1);
    expect(followDistanceFactor(cam('dot', 8).calculation!.vehicle)).toBe(1);
    expect(followDistanceFactor(cam('car', 40, false).calculation!.vehicle)).toBe(1);
  });

  it('widens the follow distance and returns the same object for the same inputs', () => {
    const r = cam('car', 40);
    const widened = effectiveAutoCam(r);
    expect(widened.distance).toBe(r.autoCam!.distance * 40);
    expect(effectiveAutoCam(r)).toBe(widened);
    expect(effectiveAutoCam(cam('car', 1))).toBeDefined();
    const same = cam('car', 1);
    expect(effectiveAutoCam(same)).toBe(same.autoCam);
  });
});

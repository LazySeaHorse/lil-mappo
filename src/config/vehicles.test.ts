import { describe, expect, it } from 'vitest';
import type { RouteItem } from '@/store/types';
import { autoCamForRoute, autoCamPresetPatch, defaultAutoCamFor, getAutoCamRanges, rescaleAutoCam, vehicleChangePatch } from './vehicles';

const route = (type: 'car' | 'plane' | 'dot', autoCam?: RouteItem['autoCam']): RouteItem => ({
  kind: 'route',
  id: 'r1',
  name: 'Route',
  geojson: { type: 'FeatureCollection', features: [] },
  startTime: 0,
  endTime: 10,
  style: {
    color: '#fff', width: 4, glow: false, glowWidth: 12,
    trailFade: false, trailFadeLength: 0.3, dashPattern: null,
  },
  easing: 'linear',
  calculation: {
    mode: 'car',
    startPoint: [0, 0],
    endPoint: [1, 1],
    vehicle: { enabled: true, type, modelId: '', scale: 1 },
  },
  autoCam,
});

describe('auto-camera ranges', () => {
  it('scales plane ranges and defaults with the plane model', () => {
    expect(getAutoCamRanges('car').distance).toEqual({ min: 100, max: 20000, step: 50 });
    expect(getAutoCamRanges('plane').distance).toEqual({ min: 10000, max: 2000000, step: 5000 });
    expect(defaultAutoCamFor('car').distance).toBe(500);
    expect(defaultAutoCamFor('plane').distance).toBe(50000);
    expect(defaultAutoCamFor('plane').height).toBe(30000);
  });

  it('keeps defaults inside their ranges', () => {
    for (const type of ['car', 'plane', 'dot'] as const) {
      const d = defaultAutoCamFor(type);
      const r = getAutoCamRanges(type);
      expect(d.distance).toBeGreaterThanOrEqual(r.distance.min);
      expect(d.distance).toBeLessThanOrEqual(r.distance.max);
      expect(d.height).toBeGreaterThanOrEqual(r.height.min);
      expect(d.height).toBeLessThanOrEqual(r.height.max);
    }
  });
});

describe('rescaleAutoCam', () => {
  it('scales framing up and back down without drift', () => {
    const car = defaultAutoCamFor('car');
    const plane = rescaleAutoCam(car, 'car', 'plane');
    expect(plane.distance).toBe(50000);
    expect(rescaleAutoCam(plane, 'plane', 'car')).toEqual(car);
  });

  it('treats car and dot alike', () => {
    const car = defaultAutoCamFor('car');
    expect(rescaleAutoCam(car, 'car', 'dot')).toBe(car);
  });

  it('clamps into the target range', () => {
    const tooFar = { ...defaultAutoCamFor('plane'), distance: 2000000 * 2 };
    expect(rescaleAutoCam(tooFar, 'plane', 'car').distance).toBe(20000);
  });
});

describe('vehicleChangePatch', () => {
  it('rescales the auto-camera when switching to a plane', () => {
    const patch = vehicleChangePatch(route('car', defaultAutoCamFor('car')), route('car').calculation!, {
      enabled: true, type: 'plane', modelId: '', scale: 1,
    });
    expect(patch.calculation?.vehicle?.type).toBe('plane');
    expect(patch.autoCam?.distance).toBe(50000);
  });

  it('rescales even while the auto-camera is disabled, so re-enabling is correct', () => {
    const disabled = { ...defaultAutoCamFor('plane'), enabled: false };
    const patch = vehicleChangePatch(route('plane', disabled), route('plane').calculation!, {
      enabled: true, type: 'car', modelId: '', scale: 1,
    });
    expect(patch.autoCam).toMatchObject({ enabled: false, distance: 500, height: 300 });
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
    expect(autoCamPresetPatch('chase', 'car', { lengthM: 2000, duration: 30 })).toMatchObject({ distance: 500, height: 300 });
  });

  it('pulls back so a long, fast route reads at its pace', () => {
    // 87 km in 15 s: the vehicle crosses the shot in about two seconds.
    const fit = autoCamPresetPatch('chase', 'car', { lengthM: 87000, duration: 15 });
    expect(Math.hypot(fit.distance!, fit.height!) / (87000 / 15)).toBeCloseTo(2, 1);
    expect(fit.distance! % 50).toBe(0);
  });

  it('keeps each preset\'s shape and stays in range', () => {
    const chase = autoCamPresetPatch('chase', 'car', { lengthM: 87000, duration: 15 });
    const drone = autoCamPresetPatch('drone', 'car', { lengthM: 87000, duration: 15 });
    expect(drone.height! / drone.distance!).toBeGreaterThan(chase.height! / chase.distance!);
    const extreme = autoCamPresetPatch('topdown', 'car', { lengthM: 1e7, duration: 1 });
    expect(extreme.height).toBe(getAutoCamRanges('car').height.max);
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

import { describe, expect, it } from 'vitest';
import type { RouteItem } from '@/store/types';
import { defaultAutoCamFor, getAutoCamRanges, rescaleAutoCam, vehicleChangePatch } from './vehicles';

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
    expect(getAutoCamRanges('car').distance).toEqual({ min: 100, max: 3000, step: 50 });
    expect(getAutoCamRanges('plane').distance).toEqual({ min: 10000, max: 300000, step: 5000 });
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
    const tooFar = { ...defaultAutoCamFor('plane'), distance: 300000 * 2 };
    expect(rescaleAutoCam(tooFar, 'plane', 'car').distance).toBe(3000);
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

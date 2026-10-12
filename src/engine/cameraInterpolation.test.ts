import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CameraKeyframe } from '@/store/types';
import { getCameraAtTime, getCameraAtTimeFromKeyframes } from './cameraInterpolation';

const kf = (time: number, zoom: number, bearing = 0): CameraKeyframe => ({
  id: `kf-${time}`,
  time,
  camera: { center: [time, 0], zoom, pitch: 0, bearing, altitude: null },
  easing: 'linear',
  followRoute: null,
});

const noRoutes = () => null;

describe('keyframe interpolation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('interpolates keyframes given out of time order', () => {
    const keyframes = [kf(10, 8), kf(0, 2), kf(5, 4)];
    expect(getCameraAtTimeFromKeyframes(keyframes, 2.5, noRoutes)).toMatchObject({ center: [2.5, 0], zoom: 3 });
    expect(getCameraAtTimeFromKeyframes(keyframes, 7.5, noRoutes)).toMatchObject({ center: [7.5, 0], zoom: 6 });
    expect(getCameraAtTime(keyframes, 7.5, noRoutes)).toMatchObject({ type: 'jumpTo', zoom: 6 });
    expect(getCameraAtTime(keyframes, -1, noRoutes)).toMatchObject({ zoom: 2 });
    expect(getCameraAtTime(keyframes, 11, noRoutes)).toMatchObject({ zoom: 8 });
  });

  it('sorts each keyframe array once, not on every frame', () => {
    const keyframes = [kf(10, 8), kf(0, 2), kf(5, 4)];
    const spy = vi.spyOn(Array.prototype, 'sort');
    const sort = { calls: () => spy.mock.contexts.filter((arr) => (arr as unknown[]).some((x) => (x as CameraKeyframe)?.camera)).length };
    for (let t = 0; t <= 10; t += 0.5) getCameraAtTime(keyframes, t, noRoutes, []);
    expect(sort.calls()).toBe(1);

    // A new array (the store replaces it on every edit) is sorted afresh.
    const edited = [...keyframes, kf(7, 5)];
    expect(getCameraAtTime(edited, 7, noRoutes, [])).toMatchObject({ zoom: 5 });
    expect(sort.calls()).toBe(2);
  });

  it('turns the short way round between bearings', () => {
    const keyframes = [kf(0, 2, 350), kf(10, 2, 10)];
    expect(getCameraAtTimeFromKeyframes(keyframes, 5, noRoutes)?.bearing).toBeCloseTo(0, 9);
    expect(getCameraAtTimeFromKeyframes(keyframes, 2.5, noRoutes)?.bearing).toBeCloseTo(355, 9);
  });
});

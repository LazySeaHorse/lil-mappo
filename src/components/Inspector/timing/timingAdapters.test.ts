import { describe, it, expect } from 'vitest';
import {
  boundaryTiming,
  calloutTiming,
  cameraViewTiming,
  routeTiming,
} from './timingAdapters';
import {
  createBoundaryItem,
  createCalloutItem,
  createCameraKeyframe,
  createEndpointRouteItem,
} from '@/store/itemFactories';
import '@/annotations/styles/index';

const line: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }],
};

function route(over: Partial<ReturnType<typeof createEndpointRouteItem>> = {}) {
  return {
    ...createEndpointRouteItem({ mode: 'car', geojson: line, start: [0, 0], end: [1, 1], name: 'R', startTime: 2, endTime: 6 }),
    ...over,
  };
}

describe('routeTiming', () => {
  it('reads start, length, motion and what happens at the end', () => {
    const item = route({ easing: 'linear', exitAnimation: 'fade' });
    expect(routeTiming.read(item)).toEqual({ start: 2, length: 4, end: 6, easing: 'linear', whenItEnds: 'fade' });
  });

  it('hides "when it ends" unless the route draws itself', () => {
    const base = route();
    for (const animationType of ['navigation', 'comet'] as const) {
      const item = { ...base, style: { ...base.style, animationType } };
      expect(routeTiming.read(item).whenItEnds).toBeUndefined();
    }
    const draw = { ...base, style: { ...base.style, animationType: 'draw' as const } };
    expect(routeTiming.read(draw).whenItEnds).toBe('none');
  });

  it('moving the start keeps the length', () => {
    expect(routeTiming.write(route(), { start: 3 })).toEqual({ startTime: 3, endTime: 7 });
  });

  it('changing the length keeps the start', () => {
    expect(routeTiming.write(route(), { length: 5 })).toEqual({ startTime: 2, endTime: 7 });
  });

  it('never starts before 0 and never makes the length 0', () => {
    expect(routeTiming.write(route(), { start: -4 })).toEqual({ startTime: 0, endTime: 4 });
    expect(routeTiming.write(route(), { length: 0 })).toEqual({ startTime: 2, endTime: 2.01 });
  });

  it('reads the end as start plus length', () => {
    expect(routeTiming.read(route()).end).toBe(6);
  });

  it('a new end changes the length and keeps the start', () => {
    expect(routeTiming.write(route(), { end: 8 })).toEqual({ startTime: 2, endTime: 8 });
    expect(routeTiming.write(route(), { end: 3 })).toEqual({ startTime: 2, endTime: 3 });
  });

  it('a new start with the old end trims the start edge', () => {
    expect(routeTiming.write(route(), { start: 4, end: 6 })).toEqual({ startTime: 4, endTime: 6 });
    expect(routeTiming.write(route(), { start: -1, end: 6 })).toEqual({ startTime: 0, endTime: 6 });
  });

  it('rejects an end that is not after the start', () => {
    expect(routeTiming.write(route(), { end: 2 })).toEqual({});
    expect(routeTiming.write(route(), { end: 1 })).toEqual({});
    expect(routeTiming.write(route(), { end: 2.005 })).toEqual({});
    expect(routeTiming.write(route(), { start: 6, end: 6 })).toEqual({});
    expect(routeTiming.write(route(), { start: 7, end: 6 })).toEqual({});
    expect(routeTiming.write(route(), { end: 2.01 })).toEqual({ startTime: 2, endTime: 2.01 });
  });

  it('rejects the bad end but still writes the other fields', () => {
    expect(routeTiming.write(route(), { end: 1, easing: 'bounce' })).toEqual({ easing: 'bounce' });
  });

  it('rounds the end time to hundredths', () => {
    expect(routeTiming.write(route(), { start: 0.1, length: 0.2 })).toEqual({ startTime: 0.1, endTime: 0.3 });
  });

  it('writes motion and the end behaviour as their own fields', () => {
    expect(routeTiming.write(route(), { easing: 'bounce' })).toEqual({ easing: 'bounce' });
    expect(routeTiming.write(route(), { whenItEnds: 'reverse' })).toEqual({ exitAnimation: 'reverse' });
  });
});

describe('boundaryTiming', () => {
  const boundary = createBoundaryItem({ placeName: 'Spain', geojson: null, startTime: 1, endTime: 4 });

  it('reads like a route', () => {
    expect(boundaryTiming.read(boundary)).toEqual({
      start: 1,
      length: 3,
      end: 4,
      easing: 'easeInOutCubic',
      whenItEnds: 'none',
    });
  });

  it('writes a new end like a route does', () => {
    expect(boundaryTiming.write(boundary, { end: 6 })).toEqual({ startTime: 1, endTime: 6 });
    expect(boundaryTiming.write(boundary, { end: 1 })).toEqual({});
  });

  it('hides "when it ends" for the trace animation only', () => {
    const traced = { ...boundary, style: { ...boundary.style, animateStroke: true, animationStyle: 'trace' as const } };
    expect(boundaryTiming.read(traced).whenItEnds).toBeUndefined();
    const drawn = { ...boundary, style: { ...boundary.style, animateStroke: true, animationStyle: 'draw' as const } };
    expect(boundaryTiming.read(drawn).whenItEnds).toBe('none');
    const off = { ...boundary, style: { ...boundary.style, animateStroke: false } };
    expect(boundaryTiming.read(off).whenItEnds).toBe('none');
  });

  it('writes time and motion', () => {
    expect(boundaryTiming.write(boundary, { start: 2 })).toEqual({ startTime: 2, endTime: 5 });
    expect(boundaryTiming.write(boundary, { easing: 'linear' })).toEqual({ easing: 'linear' });
    expect(boundaryTiming.write(boundary, { whenItEnds: 'fade' })).toEqual({ exitAnimation: 'fade' });
  });
});

describe('calloutTiming', () => {
  const callout = createCalloutItem({
    styleId: 'leader-line',
    content: { title: 'Pier' },
    lngLat: [0, 0],
    startTime: 1,
    endTime: 6,
  })!;

  it('reads time and the enter and exit animation, without motion or end behaviour', () => {
    const model = calloutTiming.read(callout);
    expect(model.start).toBe(1);
    expect(model.length).toBe(5);
    expect(model.transition).toEqual(callout.transition);
    expect(model.easing).toBeUndefined();
    expect(model.whenItEnds).toBeUndefined();
  });

  it('writes time like a route', () => {
    expect(calloutTiming.write(callout, { start: 0, length: 2 })).toEqual({ startTime: 0, endTime: 2 });
  });

  it('merges a transition change into the existing transition', () => {
    const patch = calloutTiming.write(callout, { transition: { exit: 'fade', exitDuration: 1.2 } });
    expect(patch).toEqual({ transition: { ...callout.transition, exit: 'fade', exitDuration: 1.2 } });
  });
});

describe('cameraViewTiming', () => {
  const kf = createCameraKeyframe({ time: 2.5, center: [0, 0], zoom: 5, easing: 'linear' });

  it('reads the keyframe time and motion only', () => {
    expect(cameraViewTiming.read(kf)).toEqual({ start: 2.5, easing: 'linear' });
  });

  it('writes the time to `time` and keeps no length', () => {
    expect(cameraViewTiming.write(kf, { start: 4 })).toEqual({ time: 4 });
    expect(cameraViewTiming.write(kf, { start: -1 })).toEqual({ time: 0 });
    expect(cameraViewTiming.write(kf, { easing: 'bounce' })).toEqual({ easing: 'bounce' });
  });
});

import { describe, expect, it } from 'vitest';
import '@/annotations/styles/index';
import { getStyle } from '@/annotations/registry';
import {
  DEFAULT_ITEM_DURATION,
  createBoundaryItem,
  createCalloutItem,
  createCalloutStyleDefaults,
  createCameraKeyframe,
  createEndpointRouteItem,
  createWalkRouteItem,
  defaultEndpointRouteName,
  wrapGeometry,
} from './itemFactories';

describe('itemFactories', () => {
  it('builds endpoint routes with mode-specific style and vehicle', () => {
    const line: GeoJSON.LineString = { type: 'LineString', coordinates: [[0, 0], [1, 1]] };
    const flight = createEndpointRouteItem({
      mode: 'flight', geojson: wrapGeometry(line), start: [0, 0], end: [1, 1],
      name: defaultEndpointRouteName('flight', 'A', 'B'), startTime: 2,
    });
    expect(flight.name).toBe('A → B');
    expect(flight.endTime).toBe(2 + DEFAULT_ITEM_DURATION);
    expect(flight.style.color).toBe('#f59e0b');
    expect(flight.calculation).toMatchObject({ mode: 'flight', vehicle: { type: 'plane' } });
    expect(defaultEndpointRouteName('car')).toBe('Start to End');
  });

  it('builds walk routes with derived geometry', () => {
    const walk = createWalkRouteItem({ points: [[0, 0], [0.01, 0.01]], startTime: 0 });
    expect(walk.calculation?.mode).toBe('walk');
    expect(walk.geojson.features.length).toBeGreaterThan(0);
  });

  it('keeps size out of the style defaults, so changing style keeps how big a callout is', () => {
    const defaults = createCalloutStyleDefaults(getStyle('editorial')!);
    expect(defaults).not.toHaveProperty('scale');
    expect(defaults).not.toHaveProperty('sizeMode');
    expect(defaults).not.toHaveProperty('referenceZoom');
  });

  it('builds boundaries, callouts and keyframes with defaults', () => {
    expect(createBoundaryItem({ placeName: 'X', geojson: null, startTime: 1 })).toMatchObject({
      resolveStatus: 'resolved', endTime: 6, style: { strokeColor: '#a855f7' },
    });
    const callout = createCalloutItem({ styleId: 'leader-line', content: { title: 'Hi' }, lngLat: [1, 2], startTime: 0 });
    expect(callout?.binding).toMatchObject({ kind: 'geographic', lngLat: [1, 2], altitude: 0 });
    expect(callout).toMatchObject({
      styleId: 'leader-line',
      offset: [70, -90],
      transition: { enter: 'auto', exit: 'auto', enterDuration: 1.2, exitDuration: 0.5 },
      connector: { visible: false },
      settings: { side: 'auto', accentColor: '#FF5A36' },
      scale: 1,
      sizeMode: 'screen',
      referenceZoom: 12,
    });
    expect(createCalloutItem({ styleId: 'leader-line', content: { title: 'Hi' }, lngLat: [1, 2], startTime: 0, referenceZoom: 15 })?.referenceZoom).toBe(15);
    expect(createCalloutItem({ styleId: 'nope', content: { title: '' }, lngLat: [0, 0], startTime: 0 })).toBeNull();
    expect(createCameraKeyframe({ time: 3, center: [1, 2], zoom: 4 })).toMatchObject({
      time: 3, easing: 'easeInOutCubic', followRoute: null, camera: { pitch: 0, bearing: 0, altitude: null },
    });
  });
});

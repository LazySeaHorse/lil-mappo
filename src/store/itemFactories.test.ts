import { describe, expect, it } from 'vitest';
import '@/annotations/styles/index';
import { getStyle } from '@/annotations/registry';
import {
  DEFAULT_ITEM_DURATION,
  createBoundaryItem,
  createCalloutItem,
  createCalloutStyleDefaults,
  createCameraKeyframe,
  createDefaultRouteStyle,
  createEndpointRouteItem,
  createDefaultVehicle,
  createImportedRouteItem,
  createWalkRouteItem,
  defaultEndpointRouteName,
  switchCalloutStyle,
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
    expect(flight.calculation).toMatchObject({ mode: 'flight', vehicle: { enabled: true, type: 'dot' } });
    expect(defaultEndpointRouteName('car')).toBe('Start to End');
  });

  describe('createDefaultVehicle', () => {
    it('starts every route with the dot unless the user has Pro', () => {
      for (const mode of ['car', 'walk', 'flight'] as const) {
        expect(createDefaultVehicle(mode).type).toBe('dot');
        expect(createDefaultVehicle(mode, { pro: false }).type).toBe('dot');
      }
    });

    it('gives a Pro user\'s flight the plane, and a Pro car or walk route the dot', () => {
      expect(createDefaultVehicle('flight', { pro: true })).toEqual({ enabled: true, type: 'plane', modelId: '', scale: 1 });
      expect(createDefaultVehicle('car', { pro: true }).type).toBe('dot');
      expect(createDefaultVehicle('walk', { pro: true }).type).toBe('dot');
    });

    it('lets createEndpointRouteItem pass `pro` through', () => {
      const line: GeoJSON.LineString = { type: 'LineString', coordinates: [[0, 0], [1, 1]] };
      const input = { mode: 'flight' as const, geojson: wrapGeometry(line), start: [0, 0] as [number, number], end: [1, 1] as [number, number], name: 'A', startTime: 0 };
      expect(createEndpointRouteItem({ ...input, pro: true }).calculation?.vehicle?.type).toBe('plane');
      expect(createEndpointRouteItem(input).calculation?.vehicle?.type).toBe('dot');
    });
  });

  it('builds route styles without the retired trail fade keys', () => {
    for (const preset of ['car', 'flight', 'walk', 'import'] as const) {
      const style = createDefaultRouteStyle(preset);
      expect(style).not.toHaveProperty('trailFade');
      expect(style).not.toHaveProperty('trailFadeLength');
      expect(style.cometTrailLength).toBe(0.2);
    }
  });

  it('stores the place names of the endpoints, and none for unnamed picks', () => {
    const line: GeoJSON.LineString = { type: 'LineString', coordinates: [[0, 0], [1, 1]] };
    const named = createEndpointRouteItem({
      mode: 'car', geojson: wrapGeometry(line), start: [0, 0], end: [1, 1], name: 'r', startTime: 0,
      startName: 'Times Square', endName: 'Central Park',
    });
    expect(named.calculation).toMatchObject({ startName: 'Times Square', endName: 'Central Park' });
    const unnamed = createEndpointRouteItem({ mode: 'car', geojson: wrapGeometry(line), start: [0, 0], end: [1, 1], name: 'r', startTime: 0 });
    expect(unnamed.calculation).toMatchObject({ startName: '', endName: '' });
  });

  it('stores the place name of a callout location', () => {
    expect(createCalloutItem({ styleId: 'leader-line', content: { title: 'Hi' }, lngLat: [1, 2], startTime: 0, locationName: 'Central Park' })?.locationName).toBe('Central Park');
    expect(createCalloutItem({ styleId: 'leader-line', content: { title: 'Hi' }, lngLat: [1, 2], startTime: 0 })?.locationName).toBe('');
  });

  it('builds routes and boundaries that stay on screen after their end', () => {
    const line: GeoJSON.LineString = { type: 'LineString', coordinates: [[0, 0], [1, 1]] };
    const car = createEndpointRouteItem({ mode: 'car', geojson: wrapGeometry(line), start: [0, 0], end: [1, 1], name: 'r', startTime: 0 });
    const walk = createWalkRouteItem({ points: [[0, 0], [0.01, 0.01]], startTime: 0 });
    const boundary = createBoundaryItem({ placeName: 'X', geojson: null, startTime: 0 });
    expect([car.exitAnimation, walk.exitAnimation, boundary.exitAnimation]).toEqual(['none', 'none', 'none']);
  });

  it('builds imported routes with the import style and no calculation', () => {
    const line: GeoJSON.LineString = { type: 'LineString', coordinates: [[0, 0], [1, 1]] };
    const route = createImportedRouteItem({ name: 'Ride', geojson: wrapGeometry(line), startTime: 3 });
    expect(route).toMatchObject({
      kind: 'route', name: 'Ride', startTime: 3, endTime: 3 + DEFAULT_ITEM_DURATION,
      easing: 'easeInOutCubic', exitAnimation: 'none', style: { color: '#22c55e' },
    });
    expect(route.calculation).toBeUndefined();
    expect(route.id).toBeTruthy();
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
      endTime: 6, style: { strokeColor: '#a855f7' },
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

  describe('switchCalloutStyle', () => {
    const base = () => createCalloutItem({ styleId: 'leader-line', content: { title: 'Hi' }, lngLat: [1, 2], startTime: 0 })!;

    it('takes the new style defaults and keeps the map point, size and content out of the patch', () => {
      const item = { ...base(), scale: 2, settings: {} };
      const patch = switchCalloutStyle(item, 'editorial')!;
      const defaults = createCalloutStyleDefaults(getStyle('editorial')!);
      expect(patch).toMatchObject({
        styleId: 'editorial',
        styleVersion: defaults.styleVersion,
        settings: defaults.settings,
        offset: defaults.offset,
        anchor: defaults.anchor,
        transition: defaults.transition,
        connector: defaults.connector,
      });
      expect(patch.binding).toEqual({ kind: 'geographic', lngLat: [1, 2], altitude: defaults.altitude });
      expect(patch).not.toHaveProperty('scale');
      expect(patch).not.toHaveProperty('content');
      expect(patch).not.toHaveProperty('startTime');
    });

    it('keeps settings whose key and control type exist in the new style', () => {
      const item = { ...base(), settings: { ...base().settings, accentColor: '#123456', textColor: '#abcdef', lineColor: '#654321' } };
      const patch = switchCalloutStyle(item, 'target-lock')!;
      const defaults = getStyle('target-lock')!.defaultSettings as Record<string, unknown>;
      expect(patch.settings).toMatchObject({ accentColor: '#123456', textColor: '#abcdef' });
      expect(patch.settings).not.toHaveProperty('lineColor');
      expect(patch.settings!.pulse).toBe(defaults.pulse);
    });

    it('returns a copy of the defaults, never the style object itself', () => {
      const patch = switchCalloutStyle(base(), 'editorial')!;
      expect(patch.settings).not.toBe(getStyle('editorial')!.defaultSettings);
    });

    it('leaves a screen-pinned callout binding alone', () => {
      const item = { ...base(), binding: { kind: 'screen' as const, position: [0.5, 0.5] as [number, number] } };
      expect(switchCalloutStyle(item, 'editorial')).not.toHaveProperty('binding');
    });

    it('returns null for an unknown style and for the style the callout already has', () => {
      expect(switchCalloutStyle(base(), 'nope')).toBeNull();
      expect(switchCalloutStyle(base(), 'leader-line')).toBeNull();
    });
  });
});

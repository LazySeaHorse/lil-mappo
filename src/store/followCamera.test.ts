import { beforeEach, describe, expect, it } from 'vitest';
import { canEnableFollowCamera } from './followCamera';
import { useProjectStore } from './useProjectStore';
import { createProject } from './projectDocument';
import { createTransientState } from './slices/mapEnvironmentSlice';
import { FOLLOW_CAMERA_BLOCKED } from '@/lib/terms';
import type { RouteItem } from './types';

const line = (n: number): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: Array.from({ length: n }, (_, i) => [i, i]) },
  }],
});

const route = (id: string, over: Partial<RouteItem> = {}): RouteItem => ({
  kind: 'route',
  id,
  name: id,
  startTime: 0,
  endTime: 5,
  geojson: line(3),
  style: {
    color: '#3b82f6', width: 4, glow: true, glowWidth: 12, trailFade: false,
    trailFadeLength: 0.2, dashPattern: null, animationType: 'draw', cometTrailLength: 0.2,
  },
  easing: 'linear',
  exitAnimation: 'none',
  ...over,
});

const projectWith = (...routes: RouteItem[]) => ({ items: Object.fromEntries(routes.map((r) => [r.id, r])) });

describe('canEnableFollowCamera', () => {
  it('allows a route with a path and no clash', () => {
    expect(canEnableFollowCamera(projectWith(route('a')), 'a')).toEqual({ ok: true });
  });

  it('refuses a route with fewer than 2 points', () => {
    expect(canEnableFollowCamera(projectWith(route('a', { geojson: line(1) })), 'a')).toEqual({ ok: false, reason: 'no-path' });
    expect(canEnableFollowCamera(projectWith(route('a', { geojson: { type: 'FeatureCollection', features: [] } })), 'a'))
      .toEqual({ ok: false, reason: 'no-path' });
  });

  it('refuses when another route that follows the camera overlaps in time', () => {
    const other = route('b', { name: 'Ferry', startTime: 4, endTime: 9, autoCam: { enabled: true } as RouteItem['autoCam'] });
    expect(canEnableFollowCamera(projectWith(route('a'), other), 'a')).toEqual({ ok: false, reason: 'overlap', otherName: 'Ferry' });
  });

  it('allows routes that only touch, or whose other route does not follow the camera', () => {
    const touching = route('b', { startTime: 5, endTime: 9, autoCam: { enabled: true } as RouteItem['autoCam'] });
    expect(canEnableFollowCamera(projectWith(route('a'), touching), 'a')).toEqual({ ok: true });
    const off = route('c', { startTime: 1, endTime: 3, autoCam: { enabled: false } as RouteItem['autoCam'] });
    expect(canEnableFollowCamera(projectWith(route('a'), off), 'a')).toEqual({ ok: true });
  });

  it('ignores itself and refuses an unknown id', () => {
    const self = route('a', { autoCam: { enabled: true } as RouteItem['autoCam'] });
    expect(canEnableFollowCamera(projectWith(self), 'a')).toEqual({ ok: true });
    expect(canEnableFollowCamera(projectWith(self), 'zzz')).toEqual({ ok: false, reason: 'not-found' });
  });
});

describe('setFollowCamera', () => {
  const state = () => useProjectStore.getState();
  const stored = (id: string) => state().items[id] as RouteItem;

  beforeEach(() => {
    useProjectStore.setState({ ...createProject(), ...createTransientState() });
  });

  it('turns it on with a fitted config the first time', () => {
    state().addItem(route('a'));
    expect(state().setFollowCamera('a', true)).toEqual({ ok: true });
    expect(stored('a').autoCam).toMatchObject({ enabled: true, preset: 'chase' });
  });

  it('keeps the earlier settings when it is turned on again', () => {
    state().addItem(route('a'));
    state().setFollowCamera('a', true);
    state().updateItem('a', { autoCam: { ...stored('a').autoCam!, preset: 'drone' } });
    state().setFollowCamera('a', false);
    expect(stored('a').autoCam).toMatchObject({ enabled: false, preset: 'drone' });
    state().setFollowCamera('a', true);
    expect(stored('a').autoCam).toMatchObject({ enabled: true, preset: 'drone' });
  });

  it('turning off a route that never had one changes nothing', () => {
    state().addItem(route('a'));
    expect(state().setFollowCamera('a', false)).toEqual({ ok: true });
    expect(stored('a').autoCam).toBeUndefined();
  });

  it('does not change the store when the rule says no', () => {
    state().addItem(route('a', { geojson: line(1) }));
    const before = state().items;
    expect(state().setFollowCamera('a', true)).toEqual({ ok: false, reason: 'no-path' });
    expect(state().items).toBe(before);
  });

  it('is one undo step', () => {
    state().addItem(route('a'));
    useProjectStore.temporal.getState().clear();
    state().setFollowCamera('a', true);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
  });
});

describe('FOLLOW_CAMERA_BLOCKED copy', () => {
  it('names the route in the overlap message', () => {
    expect(FOLLOW_CAMERA_BLOCKED({ ok: false, reason: 'overlap', otherName: 'Ferry' })).toContain('"Ferry"');
    expect(FOLLOW_CAMERA_BLOCKED({ ok: false, reason: 'no-path' })).toMatch(/Add a route/);
  });
});

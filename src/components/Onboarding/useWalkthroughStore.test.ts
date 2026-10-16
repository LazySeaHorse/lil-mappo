import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useWalkthroughStore, WALKTHROUGH_STORAGE_KEY } from './useWalkthroughStore';
import { createWalkthroughState } from './walkthroughState';
import { useProjectStore } from '@/store/useProjectStore';
import { createProject } from '@/store/projectDocument';
import { createTransientState } from '@/store/slices/mapEnvironmentSlice';
import { createEndpointRouteItem, wrapGeometry } from '@/store/itemFactories';
import { autoCamForRoute } from '@/config/vehicles';
import type { RouteItem } from '@/store/types';

const walkthrough = () => useWalkthroughStore.getState();
const stage = () => walkthrough().walkthrough.stage;

const line: GeoJSON.FeatureCollection = wrapGeometry({ type: 'LineString', coordinates: [[0, 1], [2, 3]] });

function newRoute(id = 'r1') {
  return createEndpointRouteItem({ id, mode: 'car', geojson: line, start: [0, 1], end: [2, 3], name: 'Trip', startTime: 0 });
}

/** Plays the tour up to a stage with the same inputs a user gives. */
function advanceTo(target: 'route-places' | 'route-preview' | 'route-insert' | 'follow-route') {
  const w = walkthrough();
  w.recordMapGesture('pan');
  w.recordMapGesture('orbit');
  w.recordMapGesture('zoom');
  w.recordAddToolOpenChange('route', true);
  if (target === 'route-places') return;
  w.recordRouteEndpoints(true, true);
  if (target === 'route-preview') return;
  useProjectStore.getState().setPreviewRoute(line);
  if (target === 'route-insert') return;
  useProjectStore.getState().addItem(newRoute());
}

describe('useWalkthroughStore store-level synchronization and entry effects', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState({
      ...createProject(),
      ...createTransientState(),
      isInspectorOpen: true,
      playheadTime: 0,
    });
    useWalkthroughStore.getState().dismiss();
    useWalkthroughStore.setState({ walkthrough: createWalkthroughState(false, 0) });
  });

  afterEach(() => {
    useWalkthroughStore.getState().dismiss();
    vi.clearAllTimers();
  });

  it('initializes walkthrough state, closes inspector, and starts subscriptions', () => {
    useProjectStore.setState({ isInspectorOpen: true });

    walkthrough().start(false);

    expect(walkthrough().isRunning).toBe(true);
    expect(stage()).toBe('map-controls');
    expect(useProjectStore.getState().isInspectorOpen).toBe(false);
    expect(localStorage.getItem(WALKTHROUGH_STORAGE_KEY)).toBe('started');
  });

  it('moves from the map controls to Plan Route on desktop and to the Add menu on mobile', () => {
    walkthrough().start(false);
    walkthrough().recordMapGesture('pan');
    walkthrough().recordMapGesture('orbit');
    expect(stage()).toBe('map-controls');
    walkthrough().recordMapGesture('zoom');
    expect(stage()).toBe('route');

    walkthrough().start(true);
    for (const gesture of ['pan', 'orbit', 'zoom'] as const) walkthrough().recordMapGesture(gesture);
    expect(stage()).toBe('open-add-menu');
    walkthrough().send({ type: 'add-menu-opened' });
    expect(stage()).toBe('route');
  });

  it('waits for a start and an end place after Plan Route opens', () => {
    walkthrough().start(false);
    advanceTo('route-places');
    expect(stage()).toBe('route-places');

    walkthrough().recordRouteEndpoints(true, false);
    expect(stage()).toBe('route-places');
    expect(walkthrough().walkthrough.routeEndpoints).toEqual({ start: true, end: false });

    walkthrough().recordRouteEndpoints(true, true);
    expect(stage()).toBe('route-preview');
  });

  it('ignores endpoint changes while the tour is not running', () => {
    walkthrough().recordRouteEndpoints(true, true);
    expect(walkthrough().walkthrough.routeEndpoints).toEqual({ start: false, end: false });
  });

  it('follows the route preview in the project store', () => {
    walkthrough().start(false);
    advanceTo('route-preview');

    useProjectStore.getState().setPreviewRoute(line);
    expect(stage()).toBe('route-insert');

    useProjectStore.getState().setPreviewRoute(null);
    expect(stage()).toBe('route-preview');
  });

  it('moves on when the route is inserted, and opens the inspector for the Follow camera switch', () => {
    walkthrough().start(false);
    advanceTo('route-insert');
    useProjectStore.setState({ isInspectorOpen: false });

    useProjectStore.getState().addItem(newRoute());
    useProjectStore.getState().selectItem('r1');

    expect(stage()).toBe('follow-route');
    expect(useProjectStore.getState().isInspectorOpen).toBe(true);
  });

  it('counts only routes added after the tour started', () => {
    useProjectStore.getState().addItem(newRoute('old'));
    walkthrough().start(false);
    advanceTo('route-places');

    useProjectStore.getState().updateItem('old', { name: 'Renamed' });
    expect(stage()).toBe('route-places');

    useProjectStore.getState().addItem(newRoute('new'));
    expect(stage()).toBe('follow-route');
  });

  it('moves on when the user turns on Follow camera, and resets the playhead for the preview', () => {
    walkthrough().start(false);
    advanceTo('follow-route');
    useProjectStore.getState().selectItem('r1');
    useProjectStore.setState({ playheadTime: 4, isInspectorOpen: true });

    const route = useProjectStore.getState().items.r1 as RouteItem;
    useProjectStore.getState().updateItem('r1', { autoCam: autoCamForRoute(route) });

    expect(stage()).toBe('play-animation');
    expect(useProjectStore.getState().playheadTime).toBe(0);
    // The timeline (with Play) is hidden on a phone while the inspector is open.
    expect(useProjectStore.getState().isInspectorOpen).toBe(false);
  });

  it('goes through play, more tools and export, and completes the tour', () => {
    walkthrough().start(false);
    useWalkthroughStore.setState({ walkthrough: { ...walkthrough().walkthrough, stage: 'play-animation' } });
    useProjectStore.setState({ isPlaying: true });

    walkthrough().next();
    expect(stage()).toBe('more-tools');
    expect(useProjectStore.getState().isPlaying).toBe(false);

    walkthrough().next();
    expect(stage()).toBe('render');

    walkthrough().recordExportOpened();
    expect(stage()).toBe('complete');
    expect(walkthrough().isRunning).toBe(false);
    expect(localStorage.getItem(WALKTHROUGH_STORAGE_KEY)).toBe('completed');
  });

  it('ignores Next in stages that wait for an action', () => {
    walkthrough().start(false);
    advanceTo('route-places');
    walkthrough().next();
    expect(stage()).toBe('route-places');
  });

  it('unsubscribes and prevents state leaks when dismissed', () => {
    walkthrough().start(false);
    advanceTo('route-places');

    walkthrough().dismiss();
    expect(walkthrough().isRunning).toBe(false);
    expect(localStorage.getItem(WALKTHROUGH_STORAGE_KEY)).toBe('dismissed');

    useProjectStore.getState().addItem(newRoute('late'));
    expect(walkthrough().isRunning).toBe(false);
    expect(stage()).toBe('route-places');
  });

  it('counts camera views added after Keep going, not the ones already there', () => {
    const view = (id: string, time: number) => ({
      id, time, easing: 'linear' as const, followRoute: null,
      camera: { center: [0, 0] as [number, number], zoom: 3, pitch: 0, bearing: 0, altitude: null },
    });
    walkthrough().start(false);
    useWalkthroughStore.setState({ walkthrough: { ...createWalkthroughState(false, 0), stage: 'more-tools' } });
    useProjectStore.getState().addCameraKeyframe(view('k0', 0));

    walkthrough().continueToExtras();
    expect(stage()).toBe('camera-view-first');

    useProjectStore.getState().addCameraKeyframe(view('k1', 1));
    expect(stage()).toBe('camera-view-second');
    useProjectStore.getState().addCameraKeyframe(view('k2', 2));
    expect(stage()).toBe('camera-view-play');
    expect(useProjectStore.getState().playheadTime).toBe(0);
  });
});

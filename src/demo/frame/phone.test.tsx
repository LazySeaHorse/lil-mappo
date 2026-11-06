import { act, cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapRef } from 'react-map-gl/mapbox';
import Toolbar from '@/components/Toolbar/Toolbar';
import InspectorPanel from '@/components/Inspector/InspectorPanel';
import TimelinePanel from '@/components/Timeline/TimelinePanel';
import { MapRefContext } from '@/hooks/useMapRef';
import { usePlayback } from '@/hooks/usePlayback';
import { setAgentMapRef } from '@/agent/mapRef';
import { CAMERA_TRACK_ID } from '@/store/projectDocument';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { useUiPreferencesStore } from '@/store/useUiPreferencesStore';
import { useAuthStore } from '@/store/useAuthStore';
import { clearHistory, installGestureTracking } from '@/store/history';
import { createEndpointRouteItem, wrapGeometry } from '@/store/itemFactories';
import type { BoundaryItem, CalloutItem, CameraItem, Project, RouteItem, TimelineItem } from '@/store/types';
import { click, installPointerCapturePatch, query } from './actions';
import { clearMocks, installFetchMocks } from './mocks';
import { DESKTOP_LOCATORS, PHONE_LOCATORS, currentLocators, type Locators } from './locators';
import { closeInspectorDrawer, showAddBar, showMainBar } from './phone';
import { planDemo, type DemoStep } from './plan';
import { runStep } from './runners';
import { startingProject } from './startState';
import { testContext } from './testContext';
import { demoFixture } from './testFixture';
import { PHONE_WIDTH, setViewportWidth } from './testViewport';

vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: { tier: 'wanderer', status: 'active' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('react-secure-storage', () => ({ default: { getItem: () => null, setItem: () => {}, removeItem: () => {} } }));
vi.mock('@/components/MapViewport/runtime/flagImages', async (importActual) => ({
  ...(await importActual<typeof import('@/components/MapViewport/runtime/flagImages')>()),
  loadFlagSvg: vi.fn(async () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"/>'),
}));

/** A map that eases to a view at once and reports it back. */
function fakeMap() {
  const camera = { center: [0, 0] as [number, number], zoom: 2, pitch: 0, bearing: 0 };
  return {
    easeTo: vi.fn((to: typeof camera) => Object.assign(camera, to)),
    isMoving: () => false,
    getCenter: () => ({ lng: camera.center[0], lat: camera.center[1] }),
    getZoom: () => camera.zoom,
    getPitch: () => camera.pitch,
    getBearing: () => camera.bearing,
  };
}

const map = fakeMap();

/** The editor's phone layout: the real toolbar (its collapsed bars), the timeline and the inspector (a drawer). */
function PhoneEditor({ withTimeline = false, withMap = false }: { withTimeline?: boolean; withMap?: boolean }) {
  // Stable, as in the app: usePlayback restarts with its ref.
  const playbackRef = useRef(null);
  usePlayback(playbackRef);
  const hideUI = useProjectStore((s) => s.hideUI);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  return (
    <MapRefContext.Provider value={{ current: withMap ? ({ getMap: () => map } as unknown as MapRef) : null }}>
      <div className={hideUI ? 'invisible' : 'visible'}>
        <Toolbar onExport={() => {}} onLibrary={() => {}} onWalkthrough={() => {}} onAddToolOpenChange={() => undefined} />
        {withTimeline && <TimelinePanel />}
        <InspectorPanel />
      </div>
      {hideUI && (
        <>
          <button title={isPlaying ? 'Pause' : 'Play'} onClick={() => useProjectStore.getState().setIsPlaying(!isPlaying)} />
          <button title="Show UI" onClick={() => useProjectStore.getState().setHideUI(false)} />
        </>
      )}
    </MapRefContext.Provider>
  );
}

const file = demoFixture();
const steps = planDemo(file);
const stepFor = (id: string, from: DemoStep[] = steps) =>
  from.find((s): s is Extract<DemoStep, { kind: 'item' }> => s.kind === 'item' && s.itemId === id)!;

let restoreViewport: () => void;
let restoreCapture: () => void;
let stopGestures: () => void;
let uninstallMocks: () => void;
let warn: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

beforeEach(() => {
  restoreViewport = setViewportWidth(PHONE_WIDTH);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  uninstallMocks = installFetchMocks();
  stopGestures = installGestureTracking();
  // As in the frame: a synthetic press cannot capture the pointer.
  Element.prototype.setPointerCapture = () => {
    throw new DOMException('No active pointer', 'NotFoundError');
  };
  restoreCapture = installPointerCapturePatch();
  useAuthStore.setState({ user: { id: 'demo' } as never });
  useUiPreferencesStore.setState({ inspectorSections: {} });
  useProjectStore.setState({ ...startingProject(file), ...createTransientState(), isInspectorOpen: false });
  useProjectStore.getState().setBoundaryDetail('standard');
  clearHistory();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  restoreViewport();
  restoreCapture();
  stopGestures();
  uninstallMocks();
  clearMocks();
  warn.mockRestore();
  useAuthStore.setState({ user: null });
});

/** Every version of an item of this kind the UI made (not the file's), to see what was shown on screen. */
function watchShown(kind: TimelineItem['kind'], targetId: string): { seen: TimelineItem[]; stop: () => void } {
  const seen: TimelineItem[] = [];
  const stop = useProjectStore.subscribe((s) => {
    for (const item of Object.values(s.items)) if (item.kind === kind && item.id !== targetId) seen.push(item);
  });
  return { seen, stop };
}

const drawerOpen = () => !!document.querySelector('[data-slot="drawer-content"]');

// Runs are not wrapped in act(): act holds React's renders until it exits, and a run needs
// each click's render before the next control can be found.
describe('locators', () => {
  it('give the phone the same controls as the desktop', () => {
    expect(Object.keys(PHONE_LOCATORS).sort()).toEqual(Object.keys(DESKTOP_LOCATORS).sort());
  });

  it('are chosen by the app’s own phone breakpoint', () => {
    expect(currentLocators()).toBe(PHONE_LOCATORS);
    restoreViewport();
    restoreViewport = setViewportWidth(1280);
    expect(currentLocators()).toBe(DESKTOP_LOCATORS);
    restoreViewport();
    // The tablet widths keep the desktop's side inspector.
    restoreViewport = setViewportWidth(760);
    expect(currentLocators()).toBe(DESKTOP_LOCATORS);
  });

  it('find the phone toolbar’s controls, each on the bar that has it', async () => {
    const L = PHONE_LOCATORS;
    const ctx = testContext();
    const found = (...names: (keyof Locators)[]) =>
      names.filter((name) => typeof L[name] === 'object' && !query(L[name] as never)).map(String);
    render(<PhoneEditor />);

    // The main bar: a button for each of the other two, and Export.
    expect(found('addMenuButton', 'mapToolsMenu', 'exportButton')).toEqual([]);
    expect(query(L.toolbarBackButton)).toBeNull();
    expect(query(L.addRouteButton)).toBeNull();

    await showAddBar(ctx, L);
    expect(found('addRouteButton', 'addBoundaryButton', 'addCalloutButton', 'addCameraViewButton', 'modelButton', 'toolbarBackButton')).toEqual([]);
    expect(query(L.exportButton)).toBeNull();

    await showMainBar(ctx, L);
    await click(ctx, L.mapToolsMenu);
    expect(found('mapStyleTrigger', 'mapSettingsButton', 'terrainToggle', 'buildingsToggle', 'toolbarBackButton')).toEqual([]);
    expect(query(L.addRouteButton)).toBeNull();
    expect(warn.mock.calls).toEqual([]);
  });
});

describe('phone layout runners', () => {
  it('adds a boundary through the Add bar and edits it in the drawer', async () => {
    render(<PhoneEditor />);
    const target = file.items['b-france'] as BoundaryItem;
    const { seen, stop } = watchShown('boundary', target.id);
    let drawerSeenOpen = false;
    const unsubscribe = useProjectStore.subscribe(() => {
      drawerSeenOpen ||= drawerOpen();
    });

    await runStep(testContext(), stepFor('b-france'), file);
    stop();
    unsubscribe();

    // The inspector edits were made in the drawer, with its own controls.
    expect(drawerSeenOpen).toBe(true);
    const shown = seen[seen.length - 1] as BoundaryItem;
    expect(shown.style).toMatchObject({ strokeColor: '#3b82f6', strokeWidth: 8, glow: false, maskOutside: true, animationStyle: 'trace' });
    expect(warn.mock.calls).toEqual([]);
    expect(useProjectStore.getState().items['b-france']).toMatchObject({ placeName: 'France', style: target.style });
    expect(useProjectStore.getState().selectedItemId).toBe('b-france');
  }, 20_000);

  it('adds a callout from the Add bar, closing the boundary’s drawer first', async () => {
    render(<PhoneEditor />);
    const ctx = testContext();
    await runStep(ctx, stepFor('b-spain'), file);
    expect(useProjectStore.getState().isInspectorOpen).toBe(true);

    const callout = { ...(file.items['c-paris'] as CalloutItem), scale: 1.5 };
    const withCallout: Project = { ...file, items: { ...file.items, [callout.id]: callout } };
    const { seen, stop } = watchShown('callout', callout.id);
    await runStep(ctx, stepFor(callout.id, planDemo(withCallout)), withCallout);
    stop();

    const shown = seen[seen.length - 1] as CalloutItem;
    expect(shown.scale).toBeCloseTo(1.5, 1);
    expect(warn.mock.calls).toEqual([]);
    expect(useProjectStore.getState().items['c-paris']).toMatchObject({ content: { title: 'Paris' } });
  }, 30_000);

  it('plans a route from the Add bar and edits it in the drawer', async () => {
    const paris: [number, number] = [2.35, 48.85];
    const lyon: [number, number] = [4.83, 45.76];
    const car: RouteItem = {
      ...createEndpointRouteItem({
        id: 'r-car',
        mode: 'car',
        geojson: wrapGeometry({ type: 'LineString', coordinates: [paris, [3.1, 47.2], lyon] }),
        start: paris,
        end: lyon,
        startName: 'Paris',
        endName: 'Lyon',
        name: 'Road trip',
        startTime: 2,
        endTime: 9,
        pro: true,
      }),
      easing: 'linear',
    };
    const withRoute: Project = { ...file, items: { [car.id]: car }, itemOrder: [car.id] };
    useProjectStore.setState({ ...startingProject(withRoute), ...createTransientState(), isInspectorOpen: false });
    render(<PhoneEditor />);
    const { seen, stop } = watchShown('route', car.id);

    await runStep(testContext(), stepFor(car.id, planDemo(withRoute)), withRoute);
    stop();

    expect(seen[seen.length - 1]).toMatchObject({ name: 'Road trip', easing: 'linear', calculation: { mode: 'car', startName: 'Paris', endName: 'Lyon' } });
    expect(warn.mock.calls).toEqual([]);
    expect(Object.keys(useProjectStore.getState().items)).toEqual(['camera-track', 'r-car']);
  }, 30_000);

  it('opens the project settings drawer from the Map Display bar and closes it for the next step', async () => {
    render(<PhoneEditor />);
    const ctx = testContext();
    const settings = steps.find((s) => s.kind === 'settings')!;
    await runStep(ctx, steps[0], file);
    await runStep(ctx, settings, file);
    expect(warn.mock.calls).toEqual([]);
    expect(useProjectStore.getState().mapStyle).toBe('dark');
    expect(drawerOpen()).toBe(true);

    await closeInspectorDrawer(ctx, PHONE_LOCATORS);
    expect(useProjectStore.getState().isInspectorOpen).toBe(false);
    expect(warn.mock.calls).toEqual([]);
  }, 30_000);

  it('brings the timeline back by closing the drawer', async () => {
    render(<PhoneEditor withTimeline />);
    act(() => useProjectStore.getState().selectItem(null));
    expect(drawerOpen()).toBe(true);
    expect(query(PHONE_LOCATORS.timelinePanel)).toBeNull();

    await closeInspectorDrawer(testContext(), PHONE_LOCATORS);
    expect(query(PHONE_LOCATORS.timelinePanel)).not.toBeNull();
    expect(query(PHONE_LOCATORS.timelinePlay)).not.toBeNull();
  });
  it('adds camera views from the Add bar, closing each view’s drawer to reach the ruler', async () => {
    setAgentMapRef({ current: { getMap: () => map } } as never);
    const camera: CameraItem = (file.items[CAMERA_TRACK_ID] as CameraItem);
    const views = camera.keyframes;
    // The timeline's boxes are where their inline style puts them (jsdom has no layout).
    const rects = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const style = (this as HTMLElement).style;
      const px = (value: string) => parseFloat(value) || 0;
      const [left, top, width, height] = [px(style?.left), px(style?.top), px(style?.width), px(style?.height)];
      return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
    });
    try {
      useProjectStore.setState({ duration: 45 });
      render(<PhoneEditor withTimeline withMap />);
      const step = steps.find((s): s is Extract<DemoStep, { kind: 'camera' }> => s.kind === 'camera')!;
      // The drawer a view opens, and each time the run closed it again to reach the timeline.
      const drawer: boolean[] = [];
      const unsubscribe = useProjectStore.subscribe((s, prev) => {
        if (s.isInspectorOpen !== prev.isInspectorOpen) drawer.push(s.isInspectorOpen);
      });

      await runStep(testContext(), step, file);
      unsubscribe();

      expect(drawer.filter(Boolean).length).toBeGreaterThanOrEqual(views.length);
      expect(drawer.filter((open) => !open).length).toBeGreaterThanOrEqual(views.length - 1);
      expect(warn.mock.calls).toEqual([]);
      const track = useProjectStore.getState().items[CAMERA_TRACK_ID] as CameraItem;
      expect(track.keyframes.map((k) => k.id)).toEqual(views.map((k) => k.id));
    } finally {
      rects.mockRestore();
      setAgentMapRef(null);
    }
  }, 30_000);

  it('plays from the timeline once the drawer is closed', async () => {
    useProjectStore.setState({ duration: 1, playheadTime: 0.4, isInspectorOpen: true });
    render(<PhoneEditor withTimeline />);
    expect(query(PHONE_LOCATORS.timelinePlay)).toBeNull();
    const plays: boolean[] = [];
    const unsubscribe = useProjectStore.subscribe((s, prev) => {
      if (s.isPlaying !== prev.isPlaying) plays.push(s.isPlaying);
    });

    await runStep(testContext(), { kind: 'play', label: 'Play' }, file);
    unsubscribe();

    expect(plays).toEqual([true, false]);
    expect(useProjectStore.getState().isInspectorOpen).toBe(false);
    expect(warn.mock.calls).toEqual([]);
  }, 15_000);

  it('goes back to the main bar for the Export button', async () => {
    render(<PhoneEditor />);
    const ctx = testContext();
    await showAddBar(ctx, PHONE_LOCATORS);
    expect(query(PHONE_LOCATORS.exportButton)).toBeNull();
    await showMainBar(ctx, PHONE_LOCATORS);
    expect(query(PHONE_LOCATORS.exportButton)).not.toBeNull();
  });
});

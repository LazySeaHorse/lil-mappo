import { render } from '@testing-library/react';
import type { MapRef } from 'react-map-gl/mapbox';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import InspectorPanel from '@/components/Inspector/InspectorPanel';
import TimelinePanel from '@/components/Timeline/TimelinePanel';
import { ToolbarButton } from '@/components/Toolbar/ToolbarPrimitives';
import { useToolbarActions } from '@/components/Toolbar/useToolbarActions';
import { MapRefContext } from '@/hooks/useMapRef';
import { setAgentMapRef } from '@/agent/mapRef';
import { CAMERA_TRACK_ID } from '@/store/projectDocument';
import { createCameraKeyframe } from '@/store/itemFactories';
import { clearHistory, getHistoryEntries, installGestureTracking } from '@/store/history';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import type { CameraItem, CameraKeyframe, Project } from '@/store/types';
import { CAMERA_VIEW_TERMS } from '@/lib/terms';
import { keyframeEdits } from './cameraRunner';
import { planDemo, type DemoStep } from './plan';
import { runStep } from './runners';
import { startingProject } from './startState';
import { testContext } from './testContext';
import { demoFixture } from './testFixture';

vi.mock('react-secure-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: { tier: 'wanderer', status: 'active' } }) }));
vi.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isMobile: false, isTablet: false }) }));

/** A map that eases to a view at once and reports it back, the way Mapbox does (a bearing within +-180, a zoom ceiling). */
function fakeMap() {
  const camera = { center: [0, 0] as [number, number], zoom: 2, pitch: 0, bearing: 0 };
  let movingUntil = 0;
  const wrap = (bearing: number) => ((((bearing + 180) % 360) + 360) % 360) - 180;
  return {
    camera,
    easeTo: vi.fn((to: { center: [number, number]; zoom: number; pitch: number; bearing: number }) => {
      Object.assign(camera, { center: to.center, zoom: Math.min(6, to.zoom), pitch: to.pitch, bearing: wrap(to.bearing) });
      movingUntil = Date.now() + 80;
    }),
    isMoving: () => Date.now() < movingUntil,
    getCenter: () => ({ lng: camera.center[0], lat: camera.center[1] }),
    getZoom: () => camera.zoom,
    getPitch: () => camera.pitch,
    getBearing: () => camera.bearing,
  };
}

let map: ReturnType<typeof fakeMap>;

function CameraButton() {
  const actions = useToolbarActions();
  return <ToolbarButton label={CAMERA_VIEW_TERMS.add} icon={null} hideLabel onClick={actions.handleAddCameraKF} walkthroughTarget="camera-keyframe" />;
}

function Editor() {
  return (
    <MapRefContext.Provider value={{ current: { getMap: () => map } as unknown as MapRef }}>
      <CameraButton />
      <TimelinePanel />
      <InspectorPanel />
    </MapRefContext.Provider>
  );
}

/** The fixture with camera views that need the inspector: a motion, a zoom the map cannot reach, a bearing that wraps. */
function fileWithViews(): Project {
  const file = demoFixture();
  const camera: CameraItem = {
    kind: 'camera',
    id: CAMERA_TRACK_ID,
    keyframes: [
      { ...createCameraKeyframe({ id: 'k1', time: 0, center: [2.35, 48.85], zoom: 5 }), easing: 'linear' },
      {
        ...createCameraKeyframe({ id: 'k2', time: 8, center: [-3, 40], zoom: 7.3, pitch: 40, bearing: 270 }),
        easing: 'easeOutQuad',
      },
    ],
  };
  return { ...file, items: { ...file.items, [CAMERA_TRACK_ID]: camera } };
}

const file = fileWithViews();
const step = planDemo(file).find((s): s is Extract<DemoStep, { kind: 'camera' }> => s.kind === 'camera')!;
const views = (project: Pick<Project, 'items'>) => (project.items[CAMERA_TRACK_ID] as CameraItem).keyframes;

let stopGestures: () => void;
let rects: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  map = fakeMap();
  setAgentMapRef({ current: { getMap: () => map } } as never);
  stopGestures = installGestureTracking();
  rects = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const style = (this as HTMLElement).style;
    const px = (value: string) => parseFloat(value) || 0;
    const [left, top, width, height] = [px(style?.left), px(style?.top), px(style?.width), px(style?.height)];
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
  });
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  useProjectStore.setState({ ...startingProject(file), ...createTransientState(), duration: 45, isInspectorOpen: true });
  clearHistory();
});

afterEach(() => {
  stopGestures();
  rects.mockRestore();
  warn.mockRestore();
  setAgentMapRef(null);
});

describe('keyframeEdits', () => {
  const live = createCameraKeyframe({ id: 'live', time: 8.004, center: [-3, 40], zoom: 7.3, pitch: 40, bearing: -90 });

  it('is the motion and what the map could not show, in inspector order', () => {
    const target: CameraKeyframe = { ...live, id: 'file', time: 8.4, easing: 'linear', camera: { ...live.camera, zoom: 6 } };
    expect(keyframeEdits(live, target)).toEqual([
      { path: 'camera.zoom', value: 6 },
      { path: 'time', value: 8.4 },
      { path: 'easing', value: 'linear' },
    ]);
  });

  it('leaves out what the button already got right: the same time on the clock, the same way round', () => {
    const target: CameraKeyframe = { ...live, id: 'file', time: 8.0049, camera: { ...live.camera, bearing: 270 } };
    expect(keyframeEdits(live, target)).toEqual([]);
  });
});

describe('camera runner', () => {
  it('goes to each view’s time on the ruler, eases the map, adds the view and edits what differs', async () => {
    render(<Editor />);
    const playheads: number[] = [];
    const snapshots: CameraKeyframe[][] = [];
    const unsubscribe = useProjectStore.subscribe((s, prev) => {
      if (s.playheadTime !== prev.playheadTime) playheads.push(s.playheadTime);
      if (s.items[CAMERA_TRACK_ID] !== prev.items[CAMERA_TRACK_ID]) snapshots.push(views(s));
    });

    await runStep(testContext(), step, file);
    unsubscribe();

    // The ruler took the playhead to the second view's time (the first view's is where the playhead already was).
    expect(playheads.some((t) => Math.abs(t - 8) < 0.05)).toBe(true);
    // The map was eased to each view, in time order.
    expect(map.easeTo.mock.calls.map(([to]) => to.zoom)).toEqual([5, 7.3]);
    expect(map.easeTo.mock.calls[1][0]).toMatchObject({ center: [-3, 40], pitch: 40, bearing: 270 });

    // The button read the map: the second view first held the zoom the map reached, then the inspector took it to 7.3.
    const made = snapshots.flat().filter((kf) => kf.time > 7 && kf.id !== 'k2');
    expect(made[0].camera).toMatchObject({ zoom: 6, pitch: 40 });
    expect(made.some((kf) => kf.easing === 'easeOutQuad' && Math.abs(kf.camera.zoom - 7.3) < 0.15)).toBe(true);
    expect(warn).not.toHaveBeenCalled();

    // The final write: the file's views, selected where the last one was.
    expect(views(useProjectStore.getState())).toEqual(views(file));
    expect(useProjectStore.getState().selectedKeyframeId).toBe('k2');
    expect(getHistoryEntries().past.every((entry) => entry.source === 'user')).toBe(true);
  }, 30_000);

  it('still ends on the file’s views when there is no toolbar button or timeline', async () => {
    await runStep(testContext(), step, file);
    expect(views(useProjectStore.getState())).toEqual(views(file));
    expect(warn).toHaveBeenCalled();
  }, 30_000);
});

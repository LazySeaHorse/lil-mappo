import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import TimelinePanel from './TimelinePanel';
import { CAMERA_TRACK_ID, useProjectStore } from '@/store/useProjectStore';
import type { CameraItem, RouteItem } from '@/store/types';

vi.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: false, isTablet: false }),
}));

const initialStore = useProjectStore.getState();
const emptyGeoJson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterAll(() => vi.unstubAllGlobals());

function route(
  id: string,
  startTime: number,
  endTime: number,
  autoCamEnabled = false,
): RouteItem {
  return {
    kind: 'route',
    id,
    name: id,
    geojson: emptyGeoJson,
    startTime,
    endTime,
    autoCam: autoCamEnabled
      ? {
          enabled: true,
          mode: 'cinematic',
          pitch: 65,
          smoothing: 0.3,
          distance: 500,
          height: 300,
          zoom: 14,
          lookAhead: 300,
        }
      : undefined,
    style: {
      color: '#000000',
      width: 4,
      glow: false,
      glowColor: '#000000',
      glowWidth: 0,
      trailFade: false,
      trailFadeLength: 0,
      dashPattern: null,
    },
    easing: 'linear',
  };
}

function camera(): CameraItem {
  return { kind: 'camera', id: CAMERA_TRACK_ID, keyframes: [] };
}

function renderTimeline(...routes: RouteItem[]) {
  const cameraTrack = camera();
  useProjectStore.setState({
    duration: 10,
    playheadTime: 0,
    isPlaying: false,
    isScrubbing: false,
    isInspectorOpen: false,
    selectedItemId: null,
    selectedKeyframeId: null,
    selectedAutoCamRouteId: null,
    items: Object.fromEntries([
      [CAMERA_TRACK_ID, cameraTrack],
      ...routes.map((item) => [item.id, item] as const),
    ]),
    itemOrder: [CAMERA_TRACK_ID, ...routes.map((item) => item.id)],
  });
  return render(<TimelinePanel />);
}

function drag(testId: string, deltaX: number) {
  const target = screen.getByTestId(testId);
  fireEvent.mouseDown(target, { clientX: 100 });
  fireEvent.mouseMove(window, { clientX: 100 + deltaX });
  fireEvent.mouseUp(window);
}

beforeEach(() => {
  act(() => useProjectStore.setState(initialStore, true));
});

describe('TimelinePanel', () => {
  it('renders tracks, transport state, and auto-camera overlays', () => {
    renderTimeline(route('ordinary', 1, 3), route('automatic', 4, 6, true));

    expect(screen.getByTestId('timeline-panel')).toBeInTheDocument();
    expect(screen.getByText('ordinary')).toBeInTheDocument();
    expect(screen.getByText('automatic')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-auto-cam-automatic')).toBeInTheDocument();
    expect(screen.getByTitle('Play / Pause (Space)')).toBeInTheDocument();
  });

  it('scrubs to the pointer time and clears scrubbing on release', () => {
    renderTimeline();
    const ruler = screen.getByTestId('timeline-ruler');
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 0,
      right: 700,
      bottom: 40,
      width: 600,
      height: 40,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.mouseDown(ruler, { clientX: 400 });
    expect(useProjectStore.getState().playheadTime).toBe(5);
    expect(useProjectStore.getState().isScrubbing).toBe(true);

    fireEvent.mouseMove(window, { clientX: 1000 });
    expect(useProjectStore.getState().playheadTime).toBe(10);
    fireEvent.mouseUp(window);
    expect(useProjectStore.getState().isScrubbing).toBe(false);
  });

  it('supports transport shortcuts and protects the camera track from deletion', () => {
    renderTimeline(route('selected', 1, 3));

    fireEvent.click(screen.getByTitle('Play / Pause (Space)'));
    expect(useProjectStore.getState().isPlaying).toBe(true);

    fireEvent.keyDown(window, { code: 'BracketRight' });
    expect(useProjectStore.getState().playheadTime).toBe(10);

    act(() => useProjectStore.getState().selectItem(CAMERA_TRACK_ID));
    fireEvent.keyDown(window, { code: 'Delete' });
    expect(useProjectStore.getState().items[CAMERA_TRACK_ID]).toBeDefined();

    act(() => useProjectStore.getState().selectItem('selected'));
    fireEvent.keyDown(window, { code: 'Delete' });
    expect(useProjectStore.getState().items.selected).toBeUndefined();
  });

  it('moves an ordinary item without applying auto-camera constraints', () => {
    renderTimeline(route('ordinary', 0, 2), route('blocked', 4, 6, true));
    drag('timeline-item-ordinary', 180);

    expect(useProjectStore.getState().items.ordinary).toMatchObject({
      startTime: 3,
      endTime: 5,
    });
  });

  it('moves an auto-camera item to the nearest legal gap', () => {
    renderTimeline(route('moving', 0, 2, true), route('blocked', 4, 6, true));
    drag('timeline-item-moving', 180);

    expect(useProjectStore.getState().items.moving).toMatchObject({
      startTime: 2,
      endTime: 4,
    });
  });

  it('constrains start and end trims at adjacent auto-camera blocks', () => {
    renderTimeline(
      route('left-block', 2, 4, true),
      route('trimming', 5, 7, true),
      route('right-block', 8, 10, true),
    );

    drag('timeline-item-trimming-start-handle', -120);
    expect(useProjectStore.getState().items.trimming).toMatchObject({ startTime: 4, endTime: 7 });

    drag('timeline-item-trimming-end-handle', 120);
    expect(useProjectStore.getState().items.trimming).toMatchObject({ startTime: 4, endTime: 8 });
  });

  it('leaves the item unchanged when no complete legal gap exists', () => {
    renderTimeline(route('moving', 0, 3, true), route('blocked', 0, 10, true));
    drag('timeline-item-moving', 120);

    expect(useProjectStore.getState().items.moving).toMatchObject({
      startTime: 0,
      endTime: 3,
    });
  });

  it('clamps item movement and keyframe dragging to timeline bounds', () => {
    const moving = route('moving', 1, 3);
    renderTimeline(moving);
    drag('timeline-item-moving', 1000);
    expect(useProjectStore.getState().items.moving).toMatchObject({ startTime: 8, endTime: 10 });

    act(() => {
      useProjectStore.getState().addCameraKeyframe({
        id: 'keyframe',
        time: 5,
        camera: { center: [0, 0], zoom: 1, pitch: 0, bearing: 0, altitude: null },
        easing: 'linear',
        followRoute: null,
      });
    });

    drag('timeline-keyframe-keyframe', -1000);
    const cameraItem = useProjectStore.getState().items[CAMERA_TRACK_ID] as CameraItem;
    expect(cameraItem.keyframes[0].time).toBe(0);
  });
});

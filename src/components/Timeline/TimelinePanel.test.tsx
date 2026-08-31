import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import TimelinePanel from './TimelinePanel';
import { CAMERA_TRACK_ID, useProjectStore } from '@/store/useProjectStore';
import type { CameraItem, RouteItem } from '@/store/types';

const responsive = vi.hoisted(() => ({
  current: { isMobile: false, isTablet: false },
}));

vi.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => responsive.current,
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
    isCameraEnabled: true,
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
  fireEvent.pointerDown(target, { clientX: 100, pointerId: 1 });
  fireEvent.pointerMove(target, { clientX: 100 + deltaX, pointerId: 1 });
  fireEvent.pointerUp(target, { pointerId: 1 });
}

beforeEach(() => {
  responsive.current = { isMobile: false, isTablet: false };
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

    fireEvent.pointerDown(ruler, { clientX: 400, pointerId: 1 });
    expect(useProjectStore.getState().playheadTime).toBe(5);
    expect(useProjectStore.getState().isScrubbing).toBe(true);

    fireEvent.pointerMove(ruler, { clientX: 700, pointerId: 1 });
    expect(useProjectStore.getState().playheadTime).toBe(10);
    fireEvent.pointerUp(ruler, { pointerId: 1 });
    expect(useProjectStore.getState().isScrubbing).toBe(false);
  });

  it('synchronizes playhead elements when time and zoom change', () => {
    renderTimeline();

    act(() => useProjectStore.getState().setPlayheadTime(2));
    expect(screen.getByTestId('timeline-ruler-playhead')).toHaveStyle({ left: '120px' });
    expect(screen.getByTestId('timeline-track-playhead')).toHaveStyle({ left: '280px' });

    fireEvent.click(screen.getByTitle('Zoom In'));
    expect(screen.getByTestId('timeline-ruler-playhead')).toHaveStyle({ left: '150px' });
    expect(screen.getByTestId('timeline-track-playhead')).toHaveStyle({ left: '310px' });

    fireEvent.wheel(screen.getByTestId('timeline-viewport-content'), {
      ctrlKey: true,
      deltaY: -20,
    });
    expect(screen.getByTestId('timeline-ruler-playhead')).toHaveStyle({ left: '170px' });
  });

  it('fits the timeline to the available panel width', () => {
    renderTimeline();
    const panel = screen.getByTestId('timeline-panel');
    Object.defineProperty(panel, 'offsetWidth', { configurable: true, value: 1184 });

    act(() => useProjectStore.getState().setPlayheadTime(2));
    fireEvent.click(screen.getByTitle('Fit to Timeline'));

    expect(screen.getByTestId('timeline-ruler-playhead')).toHaveStyle({ left: '200px' });
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

  it('selects an auto-camera route from its camera-track overlay', () => {
    renderTimeline(route('automatic', 2, 5, true));

    fireEvent.click(screen.getByTestId('timeline-auto-cam-automatic'));

    expect(useProjectStore.getState().selectedItemId).toBe('automatic');
    expect(useProjectStore.getState().selectedAutoCamRouteId).toBe('automatic');
  });

  it('toggles camera visibility from the camera track', () => {
    renderTimeline();

    fireEvent.click(screen.getByTitle('Hide Camera'));
    expect(useProjectStore.getState().isCameraEnabled).toBe(false);
    expect(screen.getByTitle('Show Camera')).toBeInTheDocument();
  });

  it('renders transport controls and timecode in the mobile layout', () => {
    responsive.current = { isMobile: true, isTablet: false };
    renderTimeline();

    expect(screen.getByTitle('Play / Pause (Space)')).toBeInTheDocument();
    expect(screen.getByText('00:00.00')).toBeInTheDocument();
    expect(screen.getByText('/ 00:10.00')).toBeInTheDocument();
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

  it('does not attach window event listeners or mutate body cursor classes during drag', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    renderTimeline(route('moving', 1, 3));

    const item = screen.getByTestId('timeline-item-moving');
    fireEvent.pointerDown(item, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(item, { clientX: 160, pointerId: 1 });
    fireEvent.pointerUp(item, { pointerId: 1 });

    const mouseMoveCalls = addEventListenerSpy.mock.calls.filter(([type]) => type === 'mousemove');
    const mouseUpCalls = addEventListenerSpy.mock.calls.filter(([type]) => type === 'mouseup');

    expect(mouseMoveCalls).toHaveLength(0);
    expect(mouseUpCalls).toHaveLength(0);
    expect(document.body.classList.contains('cursor-grabbing')).toBe(false);
    expect(document.body.classList.contains('cursor-ew-resize')).toBe(false);
    expect(document.body.style.cursor).toBe('');

    addEventListenerSpy.mockRestore();
  });

  it('safely handles unmounting mid-drag without leaving dangling body mutations', () => {
    const { unmount } = renderTimeline(route('moving', 1, 3));
    const item = screen.getByTestId('timeline-item-moving');

    fireEvent.pointerDown(item, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(item, { clientX: 160, pointerId: 1 });

    unmount();

    expect(document.body.classList.contains('cursor-grabbing')).toBe(false);
    expect(document.body.classList.contains('cursor-ew-resize')).toBe(false);
    expect(document.body.style.cursor).toBe('');
  });

  it('resizes timeline panel height via pointer events', () => {
    renderTimeline(route('item', 1, 3));
    const resizeHandle = screen.getByTestId('timeline-resize-handle');

    fireEvent.pointerDown(resizeHandle, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(resizeHandle, { clientY: 450, pointerId: 1 });
    fireEvent.pointerUp(resizeHandle, { pointerId: 1 });

    expect(useProjectStore.getState().timelineHeight).toBeGreaterThanOrEqual(120);
  });
});

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import type { CalloutItem, RouteItem } from '@/store/types';
import MapViewport from './MapViewport';
import { selectionPreviewPillState } from './previewPillState';

const mapGlRenders = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('react-map-gl/mapbox', () => ({
  default: (props: Record<string, unknown>) => {
    mapGlRenders.push(props);
    return null;
  },
}));

vi.mock('./runtime/MapSceneController', () => ({
  MapSceneController: class {
    mount() {}
    dispose() {}
  },
}));

vi.mock('@/engine/cameraUtils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/engine/cameraUtils')>()),
  syncMapToProject: vi.fn(),
}));

const initialStore = useProjectStore.getState();

/** A ResizeObserver stub whose callbacks the test fires by hand (jsdom has none). */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(private callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }
  observe(el: Element) { this.observed.push(el); }
  unobserve() {}
  disconnect() { this.disconnected = true; }
  fire() { this.callback([], this as unknown as ResizeObserver); }
}

/** Mounts the viewport with a mocked map and runs the map's onLoad, as react-map-gl would. */
function mountLoadedViewport() {
  const container = document.createElement('div');
  const map = {
    getContainer: () => container,
    resize: vi.fn(),
    triggerRepaint: vi.fn(),
  };
  const mapRef = { current: { getMap: () => map } } as unknown as Parameters<typeof MapViewport>[0]['mapRef'];
  const view = render(<MapViewport mapRef={mapRef} runtimeRef={{ current: null }} mapboxToken="pk.test" />);
  act(() => (mapGlRenders[0]?.onLoad as () => void)());
  const observer = FakeResizeObserver.instances.find((o) => o.observed.includes(container));
  return { view, map, container, observer };
}

function mountViewport() {
  return render(<MapViewport mapRef={{ current: null }} runtimeRef={{ current: null }} mapboxToken="pk.test" />);
}

describe('MapViewport', () => {
  beforeEach(() => {
    useProjectStore.setState(initialStore, true);
    mapGlRenders.length = 0;
  });

  it.each(['mercator', 'globe'] as const)('starts the map in the project projection (%s)', (projection) => {
    useProjectStore.setState({ projection });
    mountViewport();
    expect(mapGlRenders[0]?.projection).toBe(projection);
  });

  it('does not push later projection changes through the prop; the scene controller owns those', () => {
    useProjectStore.setState({ projection: 'mercator' });
    const view = mountViewport();
    useProjectStore.setState({ projection: 'globe' });
    view.rerender(<MapViewport mapRef={{ current: null }} runtimeRef={{ current: null }} mapboxToken="pk.test" />);
    expect(mapGlRenders.length).toBeGreaterThan(1);
    expect(mapGlRenders.map((props) => props.projection)).toEqual(mapGlRenders.map(() => 'mercator'));
  });

  it.each([
    { flags: {}, saved: true },
    { flags: { isExporting: true }, saved: false },
    { flags: { isCapturingViewport: true }, saved: false },
  ])('map moves update mapCenter only outside export and capture ($flags)', ({ flags, saved }) => {
    vi.useFakeTimers();
    try {
      const setMapCenter = vi.fn();
      useProjectStore.setState({ setMapCenter, ...flags });
      mountViewport();
      const onMove = mapGlRenders[0]?.onMove as (e: unknown) => void;
      onMove({ viewState: { longitude: 7, latitude: 8 } });
      vi.advanceTimersByTime(200);
      if (saved) expect(setMapCenter).toHaveBeenCalledWith([7, 8]);
      else expect(setMapCenter).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    { lngLat: [0, 0] as [number, number], placed: false },
    { lngLat: [0, 5] as [number, number], placed: true },
    { lngLat: [12, 34] as [number, number], placed: true },
  ])('a map click places the selected callout only while it is unplaced ($lngLat)', ({ lngLat, placed }) => {
    const callout = { kind: 'callout', id: 'c1', binding: { kind: 'geographic', lngLat, altitude: 0 } } as unknown as CalloutItem;
    const updateItem = vi.fn();
    useProjectStore.setState({ items: { c1: callout }, selectedItemId: 'c1', activePicker: null, updateItem });
    mountViewport();
    const onClick = mapGlRenders[0]?.onClick as (e: unknown) => void;
    onClick({ lngLat: { lng: 7, lat: 8 } });
    if (placed) expect(updateItem).not.toHaveBeenCalled();
    else expect(updateItem).toHaveBeenCalledWith('c1', { binding: { kind: 'geographic', lngLat: [7, 8], altitude: 0 } });
  });

  it('leaves the selection preview pill to the editor, so fit mode does not scale it with the map', () => {
    const route = { kind: 'route', id: 'r', name: 'Coast road', startTime: 2, endTime: 6 } as RouteItem;
    useProjectStore.setState({ duration: 10, items: { r: route }, itemOrder: ['r'] });
    mountViewport();
    act(() => useProjectStore.getState().selectItem('r'));
    // The pill would show for this selection, but not from inside the map's (scaled) wrapper.
    expect(selectionPreviewPillState(useProjectStore.getState())).not.toBeNull();
    expect(screen.queryByTestId('selection-preview-pill')).toBeNull();
  });

  describe('map container resizes', () => {
    const originalResizeObserver = globalThis.ResizeObserver;
    beforeEach(() => {
      FakeResizeObserver.instances = [];
      globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    });
    afterEach(() => {
      globalThis.ResizeObserver = originalResizeObserver;
    });

    // Mapbox only resizes its canvas on window events, so fit mode, orientation and aspect changes
    // (which resize the container, not the window) left it drawing at its old size.
    it('resizes and repaints the map when its container changes size', () => {
      const { map, observer } = mountLoadedViewport();
      expect(observer).toBeDefined();
      map.resize.mockClear();
      map.triggerRepaint.mockClear();
      observer!.fire();
      expect(map.resize).toHaveBeenCalledTimes(1);
      expect(map.triggerRepaint).toHaveBeenCalled();
    });

    it('stops observing the container when the viewport unmounts', () => {
      const { view, observer } = mountLoadedViewport();
      expect(observer).toBeDefined();
      view.unmount();
      expect(observer!.disconnected).toBe(true);
    });
  });
});

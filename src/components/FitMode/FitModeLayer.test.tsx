import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as MapboxMap } from 'mapbox-gl';
import { MapRefContext } from '@/hooks/useMapRef';
import { useProjectStore } from '@/store/useProjectStore';
import { getViewOffset, NO_FIT_VIEW, setViewFit } from '@/engine/viewOffset';
import { moveToFitView } from '@/engine/viewFit';
import { FitModeLayer } from './FitModeLayer';

function fakeMap(zoom = 10) {
  const map = { getZoom: vi.fn(() => zoom), easeTo: vi.fn() };
  return { map, api: map as unknown as MapboxMap };
}

beforeEach(() => {
  useProjectStore.setState({ isPlaying: false, isScrubbing: false, isExporting: false, isFitMode: false, hideUI: false, timelineHeight: 200 });
});
afterEach(() => setViewFit(NO_FIT_VIEW));

describe('moveToFitView', () => {
  const view = { offset: -1, padding: { top: 0, bottom: 100, left: 0, right: 372 } };

  it('eases zoom and padding together into fit mode, and records the offset at once', () => {
    const { map, api } = fakeMap(10);
    moveToFitView(api, view);
    expect(map.easeTo).toHaveBeenCalledTimes(1);
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 9, padding: view.padding }));
    expect(map.easeTo.mock.calls[0][0].duration).toBeGreaterThan(0);
    expect(getViewOffset()).toBe(-1);
  });

  it('eases back out by the same amount', () => {
    const { map, api } = fakeMap(10);
    moveToFitView(api, view);
    map.getZoom.mockReturnValue(9);
    moveToFitView(api, NO_FIT_VIEW);
    expect(map.easeTo.mock.calls[1][0]).toMatchObject({ zoom: 10, padding: NO_FIT_VIEW.padding });
    expect(getViewOffset()).toBe(0);
  });

  it('jumps for a change within fit mode, such as a resize, and does nothing for no change', () => {
    const { map, api } = fakeMap(9);
    moveToFitView(api, view);
    map.easeTo.mockClear();
    moveToFitView(api, view);
    expect(map.easeTo).not.toHaveBeenCalled();
    moveToFitView(api, { ...view, offset: -1.2 });
    expect(map.easeTo.mock.calls[0][0]).toMatchObject({ duration: 0 });
    expect(map.easeTo.mock.calls[0][0].zoom).toBeCloseTo(8.8);
  });

  it('does not animate while the project plays', () => {
    useProjectStore.setState({ isPlaying: true });
    const { map, api } = fakeMap();
    moveToFitView(api, view);
    expect(map.easeTo.mock.calls[0][0].duration).toBe(0);
  });
});

describe('FitModeLayer', () => {
  class FakeResizeObserver {
    constructor(private cb: () => void) {}
    observe() { this.cb(); }
    disconnect() {}
  }

  const renderLayer = (map: MapboxMap) => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1600 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 900 });
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
    return render(
      <MapRefContext.Provider value={{ current: { getMap: () => map } as never }}>
        <FitModeLayer mapReady />
      </MapRefContext.Provider>,
    );
  };

  afterEach(() => vi.unstubAllGlobals());

  it('shows no scrim or move in full screen', () => {
    const { map, api } = fakeMap();
    renderLayer(api);
    expect(screen.getByTestId('fit-mode-layer').style.opacity).toBe('0');
    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it('shows the frame with a reticle and moves the map when turned on, and undoes it for zen mode', () => {
    const { map, api } = fakeMap(10);
    renderLayer(api);
    act(() => useProjectStore.setState({ isFitMode: true }));
    const layer = screen.getByTestId('fit-mode-layer');
    expect(layer.style.opacity).toBe('1');
    const frame = screen.getByTestId('fit-frame');
    expect(parseFloat(frame.style.width) / parseFloat(frame.style.height)).toBeCloseTo(16 / 9);
    expect(screen.getByTestId('fit-reticle')).toBeInTheDocument();
    expect(map.easeTo).toHaveBeenCalledTimes(1);
    expect(map.easeTo.mock.calls[0][0].zoom).toBeLessThan(10);

    act(() => useProjectStore.setState({ hideUI: true }));
    expect(layer.style.opacity).toBe('0');
    expect(getViewOffset()).toBe(0);
  });
});

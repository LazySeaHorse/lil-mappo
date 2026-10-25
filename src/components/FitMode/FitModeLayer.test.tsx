import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { fitFrame } from '@/engine/viewFit';
import { FitModeMap } from './FitModeMap';
import { fitFrameState, fitMapStyle, FULL_SCREEN, isFitModeOn } from './useFitFrame';

const desktop = { isMobile: false, isTablet: false };
const editor = { width: 1600, height: 900 };

beforeEach(() => {
  useProjectStore.setState({ isFitMode: false, hideUI: false, timelineHeight: 200, isCapturingViewport: false, resolution: [1920, 1080] });
});

describe('isFitModeOn', () => {
  it('is on only with fit mode chosen, the UI shown and the full toolbar', () => {
    expect(isFitModeOn(true, false, false)).toBe(true);
    expect(isFitModeOn(false, false, false)).toBe(false);
    // Hide UI and the narrow layouts turn it off, so the theme goes back to the map style's.
    expect(isFitModeOn(true, true, false)).toBe(false);
    expect(isFitModeOn(true, false, true)).toBe(false);
  });
});

describe('fitFrameState', () => {
  it('keeps the map at the editor width, shaped like the video and scaled into the frame', () => {
    const fit = fitFrameState(true, editor, 9 / 16, desktop, 200);
    const frame = fitFrame(editor, 9 / 16, desktop, 200)!;
    expect(fit).toMatchObject({ active: true, frame, mapWidth: 1600, mapHeight: 1600 / (9 / 16) });
    expect(fit.scale).toBeCloseTo(frame.width / 1600);
    // Scaled, the map's height is the frame's: the frame shows the whole video.
    expect(fit.mapHeight * fit.scale).toBeCloseTo(frame.height);
  });

  it('is full screen when off, unmeasured or without room', () => {
    expect(fitFrameState(false, editor, 16 / 9, desktop, 200)).toBe(FULL_SCREEN);
    expect(fitFrameState(true, null, 16 / 9, desktop, 200)).toBe(FULL_SCREEN);
    expect(fitFrameState(true, { width: 0, height: 0 }, 16 / 9, desktop, 200)).toBe(FULL_SCREEN);
  });
});

describe('fitMapStyle', () => {
  it('scales the map from its corner into the frame, and lifts the scale for captures', () => {
    const fit = fitFrameState(true, editor, 16 / 9, desktop, 200);
    const { frame, scale } = fit;
    expect(fitMapStyle(fit, false)).toEqual({
      width: 1600,
      height: 900,
      transformOrigin: '0 0',
      transform: `translate(${frame!.x}px, ${frame!.y}px) scale(${scale})`,
    });
    expect(fitMapStyle(fit, true)).toMatchObject({ width: 1600, height: 900, transform: 'none' });
    expect(fitMapStyle(FULL_SCREEN, false)).toBeUndefined();
  });
});

describe('FitModeMap', () => {
  class FakeResizeObserver {
    constructor(private cb: () => void) {}
    observe() { this.cb(); }
    disconnect() {}
  }

  const renderMap = () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1600 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 900 });
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
    return render(<FitModeMap><div data-testid="the-map" /></FitModeMap>);
  };

  afterEach(() => vi.unstubAllGlobals());

  it('leaves the map full size, with no frame, in full screen', () => {
    renderMap();
    expect(screen.getByTestId('fit-mode-layer').dataset.active).toBe('false');
    expect(screen.queryByTestId('fit-frame')).toBeNull();
    expect(screen.getByTestId('fit-map').style.transform).toBe('');
    expect(screen.getByTestId('map-stage').className).not.toContain('bg-black');
    expect(within(screen.getByTestId('fit-map')).getByTestId('the-map')).toBeInTheDocument();
  });

  it('scales the map into the frame on black, marks the frame, and goes back for zen mode', () => {
    renderMap();
    act(() => useProjectStore.setState({ isFitMode: true }));
    expect(screen.getByTestId('fit-mode-layer').dataset.active).toBe('true');
    const wrapper = screen.getByTestId('fit-map');
    expect(wrapper.style.width).toBe('1600px');
    expect(wrapper.style.height).toBe('900px');
    expect(wrapper.style.transform).toMatch(/^translate\(.+\) scale\(0\.\d+\)$/);
    expect(screen.getByTestId('map-stage').className).toContain('bg-black');

    const frame = screen.getByTestId('fit-frame');
    expect(parseFloat(frame.style.width) / parseFloat(frame.style.height)).toBeCloseTo(16 / 9);
    expect(within(frame).getByTestId('fit-reticle')).toBeInTheDocument();
    const marks = within(frame).getByTestId('system-overlays');
    expect([...marks.querySelectorAll('[data-overlay]')].map((el) => el.getAttribute('data-overlay'))).toEqual(['mapbox-logo', 'attribution']);

    act(() => useProjectStore.setState({ isCapturingViewport: true }));
    expect(wrapper.style.transform).toBe('none');
    act(() => useProjectStore.setState({ isCapturingViewport: false }));

    act(() => useProjectStore.setState({ hideUI: true }));
    expect(screen.getByTestId('fit-mode-layer').dataset.active).toBe('false');
    expect(wrapper.style.transform).toBe('');
  });
});

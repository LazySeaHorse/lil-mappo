import type { Map as MapboxMap } from 'mapbox-gl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { BasemapController } from './BasemapController';

function createMapDouble() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const on = vi.fn((name: string, listener: (event: unknown) => void) => {
    const group = listeners.get(name) ?? new Set();
    group.add(listener);
    listeners.set(name, group);
  });
  const off = vi.fn((name: string, listener: (event: unknown) => void) => {
    listeners.get(name)?.delete(listener);
  });
  const control = () => ({ enable: vi.fn(), disable: vi.fn() });
  const state = useProjectStore.getState();

  const map = {
    on,
    off,
    isStyleLoaded: vi.fn(() => true),
    getProjection: vi.fn(() => ({ name: state.projection })),
    setProjection: vi.fn(),
    getConfigProperty: vi.fn(() => undefined),
    setConfigProperty: vi.fn(),
    getLayer: vi.fn(),
    getLayoutProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    getStyle: vi.fn(() => ({ version: 8, sources: {}, layers: [] })),
    getSource: vi.fn(),
    addSource: vi.fn(),
    getTerrain: vi.fn(),
    setTerrain: vi.fn(),
    getFog: vi.fn(),
    setFog: vi.fn(),
    isSourceLoaded: vi.fn(() => false),
    dragPan: control(),
    dragRotate: control(),
    scrollZoom: control(),
    touchZoomRotate: control(),
    doubleClickZoom: control(),
    keyboard: control(),
  };

  return { map: map as unknown as MapboxMap, listeners, ...map };
}

afterEach(() => {
  useProjectStore.getState().setIsPlaying(false);
});

describe('BasemapController', () => {
  it('owns and releases all Mapbox lifecycle listeners', () => {
    const double = createMapDouble();
    const controller = new BasemapController(double.map, vi.fn());

    controller.mount();

    expect([...double.listeners.keys()]).toEqual([
      'style.load',
      'styleimportdata',
      'sourcedataloading',
      'sourcedata',
      'idle',
      'error',
    ]);
    expect(double.setConfigProperty).toHaveBeenCalled();

    controller.dispose();

    expect(double.off).toHaveBeenCalledTimes(6);
    expect([...double.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
  });

  it('synchronizes map interactivity with playback and unsubscribes on dispose', () => {
    const double = createMapDouble();
    const controller = new BasemapController(double.map, vi.fn());
    controller.mount();

    useProjectStore.getState().setIsPlaying(true);
    expect(double.dragPan.disable).toHaveBeenCalled();

    controller.dispose();
    const disableCalls = double.dragPan.disable.mock.calls.length;
    useProjectStore.getState().setIsPlaying(false);
    useProjectStore.getState().setIsPlaying(true);
    expect(double.dragPan.disable).toHaveBeenCalledTimes(disableCalls);
  });
});

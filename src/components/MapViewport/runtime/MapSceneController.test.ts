import type { Map as MapboxMap } from 'mapbox-gl';
import { describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import type { RouteItem } from '@/store/types';
import { MapSceneController } from './MapSceneController';

const route: RouteItem = {
  kind: 'route',
  id: 'scene-route',
  name: 'Scene route',
  geojson: {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
    }],
  },
  startTime: 0,
  endTime: 5,
  style: {
    color: '#123456',
    width: 4,
    glow: false,
    glowColor: '#abcdef',
    glowWidth: 12,
    trailFade: false,
    trailFadeLength: 0.3,
    dashPattern: null,
    animationType: 'draw',
  },
  easing: 'linear',
  calculation: { mode: 'manual', startPoint: [0, 0], endPoint: [1, 1] },
};

function createMapDouble() {
  const layers = new Map<string, { id: string; type: string; source?: string }>();
  const sources = new Map<string, { type: 'geojson'; setData: ReturnType<typeof vi.fn> }>();
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const control = () => ({ enable: vi.fn(), disable: vi.fn() });
  const state = useProjectStore.getState();
  let styleLoaded = true;

  const map = {
    layers,
    sources,
    listeners,
    on: vi.fn((name: string, listener: (event: unknown) => void) => {
      const group = listeners.get(name) ?? new Set();
      group.add(listener);
      listeners.set(name, group);
    }),
    off: vi.fn((name: string, listener: (event: unknown) => void) => listeners.get(name)?.delete(listener)),
    once: vi.fn(),
    loaded: vi.fn(() => true),
    isStyleLoaded: vi.fn(() => styleLoaded),
    style: {
      get _loaded() { return styleLoaded; },
    },
    getProjection: vi.fn(() => ({ name: state.projection })),
    setProjection: vi.fn(),
    getConfigProperty: vi.fn(),
    setConfigProperty: vi.fn(),
    getStyle: vi.fn(() => ({ version: 8, sources: {}, layers: [...layers.values()] })),
    getLayer: vi.fn((id: string) => layers.get(id)),
    addLayer: vi.fn((layer: { id: string; type: string; source?: string }) => layers.set(layer.id, layer)),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    getLayoutProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string) => {
      if (!styleLoaded) throw new Error('Style is not done loading');
      sources.set(id, { type: 'geojson', setData: vi.fn() });
    }),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    getTerrain: vi.fn(),
    setTerrain: vi.fn(),
    getFog: vi.fn(),
    setFog: vi.fn(),
    isSourceLoaded: vi.fn(() => false),
    hasModel: vi.fn(() => false),
    addModel: vi.fn(),
    dragPan: control(),
    dragRotate: control(),
    scrollZoom: control(),
    touchZoomRotate: control(),
    doubleClickZoom: control(),
    keyboard: control(),
  };

  return {
    map: map as unknown as MapboxMap,
    ...map,
    setStyleLoaded: (loaded: boolean) => { styleLoaded = loaded; },
  };
}

describe('MapSceneController', () => {
  it('defers a project scene swap until the replacement style has loaded', () => {
    const previous = useProjectStore.getState();
    useProjectStore.setState({ items: {}, itemOrder: [], playheadTime: 0 });
    const double = createMapDouble();
    const controller = new MapSceneController(double.map, vi.fn());

    try {
      controller.mount();
      double.setStyleLoaded(false);

      // A project load updates the store while react-map-gl is replacing the style.
      // Mapbox rejects custom resource creation during this interval.
      expect(() => useProjectStore.setState({
        items: { [route.id]: route },
        itemOrder: [route.id],
      })).not.toThrow();
      expect(double.sources.has('route-scene-route')).toBe(false);

      double.setStyleLoaded(true);
      double.listeners.get('style.load')?.forEach((listener) => listener({}));
      expect(double.layers.has('route-layer-scene-route')).toBe(true);
    } finally {
      controller.dispose();
      useProjectStore.setState({
        items: previous.items,
        itemOrder: previous.itemOrder,
        playheadTime: previous.playheadTime,
        detectedCapabilities: previous.detectedCapabilities,
        isPlaying: previous.isPlaying,
      });
    }
  });

  it('owns frame updates and rebuilds custom resources after style.load', () => {
    const previous = useProjectStore.getState();
    useProjectStore.setState({
      items: { [route.id]: route },
      itemOrder: [route.id],
      playheadTime: 0,
    });
    const double = createMapDouble();
    const controller = new MapSceneController(double.map, vi.fn());

    try {
      controller.mount();
      expect(double.layers.has('route-layer-scene-route')).toBe(true);

      const sceneSource = double.sources.get('route-scene-route');
      expect(sceneSource).toBeDefined();
      sceneSource!.setData.mockClear();

      useProjectStore.getState().setPlayheadTime(2.5);
      expect(sceneSource!.setData).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'FeatureCollection',
          features: [
            expect.objectContaining({
              geometry: expect.objectContaining({
                type: 'LineString',
                coordinates: [
                  [0, 0],
                  [0.5, 0.5],
                ],
              }),
            }),
          ],
        }),
      );

      double.layers.clear();
      double.sources.clear();
      double.listeners.get('style.load')?.forEach((listener) => listener({}));
      expect(double.layers.has('route-layer-scene-route')).toBe(true);
    } finally {
      controller.dispose();
      useProjectStore.setState({
        items: previous.items,
        itemOrder: previous.itemOrder,
        playheadTime: previous.playheadTime,
        detectedCapabilities: previous.detectedCapabilities,
        isPlaying: previous.isPlaying,
      });
    }

    expect([...double.listeners.values()].every((group) => group.size === 0)).toBe(true);
    expect(double.layers.has('route-layer-scene-route')).toBe(false);
  });

  it('renders scene elements when style._loaded is true even if isStyleLoaded returns false due to source updates', () => {
    const previous = useProjectStore.getState();
    useProjectStore.setState({
      items: { [route.id]: route },
      itemOrder: [route.id],
      playheadTime: 2.5,
    });
    const double = createMapDouble();
    // Simulate Mapbox behavior where isStyleLoaded() returns false when sources/tiles are in flight,
    // but the stylesheet is loaded (style._loaded is true).
    double.isStyleLoaded.mockReturnValue(false);
    double.setStyleLoaded(true);

    const controller = new MapSceneController(double.map, vi.fn());

    try {
      controller.mount();
      expect(double.layers.has('route-layer-scene-route')).toBe(true);
      const sceneSource = double.sources.get('route-scene-route');
      expect(sceneSource).toBeDefined();
      expect(sceneSource!.setData).toHaveBeenCalled();
    } finally {
      controller.dispose();
      useProjectStore.setState({
        items: previous.items,
        itemOrder: previous.itemOrder,
        playheadTime: previous.playheadTime,
        detectedCapabilities: previous.detectedCapabilities,
        isPlaying: previous.isPlaying,
      });
    }
  });
});

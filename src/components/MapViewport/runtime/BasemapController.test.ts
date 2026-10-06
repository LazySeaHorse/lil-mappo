import type { Map as MapboxMap } from 'mapbox-gl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { STANDARD_CAPABILITIES } from '@/config/mapbox';
import { detectRuntimeCapabilities } from '../mapUtils';
import { BasemapController } from './BasemapController';
import { track } from '@/lib/analytics';

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

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
    addLayer: vi.fn(),
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
    hasImage: vi.fn(() => false),
    addImage: vi.fn(),
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
      'styleimagemissing',
    ]);
    expect(double.setConfigProperty).toHaveBeenCalled();

    controller.dispose();

    expect(double.off).toHaveBeenCalledTimes(7);
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

  it('delegates styleimagemissing event to add missing style image', async () => {
    const double = createMapDouble();
    const controller = new BasemapController(double.map, vi.fn());
    controller.mount();

    const missingListeners = double.listeners.get('styleimagemissing');
    expect(missingListeners).toBeDefined();

    for (const listener of missingListeners!) {
      listener({ id: 'texture-64' });
    }

    // Wait a tick for async resolution
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(double.addImage).toHaveBeenCalledWith('texture-64', expect.anything());

    controller.dispose();
  });

  it('reconciles Standard labels through config properties only', () => {
    const double = createMapDouble();
    double.getStyle.mockReturnValue({ version: 8, sources: {}, layers: [{ id: 'road-label' }] });
    const store = useProjectStore.getState();
    store.setMapStyle('standard');
    store.setDetectedCapabilities(STANDARD_CAPABILITIES);
    store.setLabelGroupVisibility('road', false);
    const controller = new BasemapController(double.map, vi.fn());
    controller.mount();

    expect(double.setConfigProperty).toHaveBeenCalledWith('basemap', 'showRoadLabels', false);
    expect(double.setLayoutProperty).not.toHaveBeenCalledWith('road-label', 'visibility', expect.anything());

    controller.dispose();
    store.setAllLabelsVisibility(true);
  });

  it('reconciles classic style labels through layer patterns only', () => {
    const double = createMapDouble();
    double.getStyle.mockReturnValue({ version: 8, sources: {}, layers: [{ id: 'road-label' }, { id: 'poi-label' }] });
    const store = useProjectStore.getState();
    store.setMapStyle('streets');
    store.setDetectedCapabilities(detectRuntimeCapabilities(double.map, 'streets'));
    store.setLabelGroupVisibility('road', false);
    const controller = new BasemapController(double.map, vi.fn());
    controller.mount();

    expect(double.setLayoutProperty).toHaveBeenCalledWith('road-label', 'visibility', 'none');
    expect(double.setConfigProperty).not.toHaveBeenCalledWith('basemap', 'showRoadLabels', expect.anything());

    controller.dispose();
    store.setMapStyle('standard');
    store.setAllLabelsVisibility(true);
  });

  describe('3d-buildings layer', () => {
    const classicLayers = [
      { id: 'land', type: 'background' },
      { id: 'road', type: 'line' },
      { id: 'road-label', type: 'symbol' },
      { id: 'poi-label', type: 'symbol' },
    ];

    /** Makes addLayer/getLayer/getLayoutProperty behave like a real style for the buildings layer. */
    function withCompositeStyle(double: ReturnType<typeof createMapDouble>, layers = classicLayers) {
      const added = new Map<string, string>();
      double.getStyle.mockReturnValue({ version: 8, sources: {}, layers } as never);
      double.getSource.mockImplementation(((id: string) => (id === 'composite' ? {} : undefined)) as never);
      double.addLayer.mockImplementation(((layer: { id: string; layout: { visibility: string } }) => {
        added.set(layer.id, layer.layout.visibility);
      }) as never);
      double.getLayer.mockImplementation(((id: string) => (added.has(id) ? { id } : undefined)) as never);
      double.getLayoutProperty.mockImplementation(((id: string) => added.get(id)) as never);
      double.setLayoutProperty.mockImplementation(((id: string, _p: string, value: string) => {
        added.set(id, value);
      }) as never);
      return added;
    }

    afterEach(() => {
      const store = useProjectStore.getState();
      store.setBuildingsEnabled(false);
      store.setMapStyle('standard');
    });

    it('is added on style load below the first symbol layer and follows buildingsEnabled', () => {
      const double = createMapDouble();
      const added = withCompositeStyle(double);
      const store = useProjectStore.getState();
      store.setMapStyle('streets');
      store.setBuildingsEnabled(true);
      const controller = new BasemapController(double.map, vi.fn());
      controller.mount();

      expect(double.addLayer).toHaveBeenCalledTimes(1);
      expect(double.addLayer).toHaveBeenCalledWith(
        expect.objectContaining({ id: '3d-buildings', source: 'composite', 'source-layer': 'building', type: 'fill-extrusion', minzoom: 14 }),
        'road-label',
      );
      expect(added.get('3d-buildings')).toBe('visible');

      store.setBuildingsEnabled(false);
      controller.reconcile();
      expect(added.get('3d-buildings')).toBe('none');
      expect(double.addLayer).toHaveBeenCalledTimes(1);

      controller.dispose();
    });

    it('is re-added with the current visibility after a style swap', () => {
      const double = createMapDouble();
      const added = withCompositeStyle(double);
      const store = useProjectStore.getState();
      store.setMapStyle('streets');
      store.setBuildingsEnabled(true);
      const controller = new BasemapController(double.map, vi.fn());
      controller.mount();

      // Mapbox drops custom layers when the style is replaced
      added.clear();
      store.setMapStyle('light');
      for (const listener of double.listeners.get('style.load')!) listener({});

      expect(double.addLayer).toHaveBeenCalledTimes(2);
      expect(added.get('3d-buildings')).toBe('visible');

      controller.dispose();
    });

    it('is not added on Standard, satellite, or styles without a composite source', () => {
      const store = useProjectStore.getState();
      store.setBuildingsEnabled(true);
      for (const style of ['standard', 'satellite'] as const) {
        const double = createMapDouble();
        withCompositeStyle(double);
        store.setMapStyle(style);
        const controller = new BasemapController(double.map, vi.fn());
        controller.mount();
        expect(double.addLayer).not.toHaveBeenCalled();
        controller.dispose();
      }

      const double = createMapDouble();
      withCompositeStyle(double);
      double.getSource.mockReturnValue(undefined as never);
      store.setMapStyle('streets');
      const controller = new BasemapController(double.map, vi.fn());
      controller.mount();
      expect(double.addLayer).not.toHaveBeenCalled();
      controller.dispose();
    });
  });

  it('does not re-reconcile on idle or DEM sourcedata events', () => {
    const double = createMapDouble();
    const store = useProjectStore.getState();
    store.setMapStyle('standard');
    store.setDetectedCapabilities(STANDARD_CAPABILITIES);
    const controller = new BasemapController(double.map, vi.fn());
    controller.mount();
    vi.clearAllMocks();

    for (const listener of double.listeners.get('idle')!) listener({});
    for (const listener of double.listeners.get('sourcedata')!) listener({ sourceId: 'mapbox-dem' });

    expect(double.setConfigProperty).not.toHaveBeenCalled();
    expect(double.setFog).not.toHaveBeenCalled();
    expect(double.setProjection).not.toHaveBeenCalled();
    expect(double.setTerrain).not.toHaveBeenCalled();
    expect(double.getFog).not.toHaveBeenCalled();

    controller.dispose();
  });

  it('still reconciles on styleimportdata (Standard basemap import becoming ready)', () => {
    const double = createMapDouble();
    const store = useProjectStore.getState();
    store.setMapStyle('standard');
    store.setDetectedCapabilities(STANDARD_CAPABILITIES);
    const controller = new BasemapController(double.map, vi.fn());
    controller.mount();
    vi.clearAllMocks();

    for (const listener of double.listeners.get('styleimportdata')!) listener({});

    expect(double.setConfigProperty).toHaveBeenCalled();
    controller.dispose();
  });

  it('scans the style once per load and reconciles labels without getStyle afterwards', () => {
    const double = createMapDouble();
    double.getStyle.mockReturnValue({ version: 8, sources: {}, layers: [{ id: 'road-label' }, { id: 'land' }] });
    const store = useProjectStore.getState();
    store.setMapStyle('streets');
    store.setDetectedCapabilities(detectRuntimeCapabilities(double.map, 'streets'));
    const controller = new BasemapController(double.map, vi.fn());
    controller.mount();
    double.getStyle.mockClear();

    store.setLabelGroupVisibility('road', false);
    controller.reconcile();

    expect(double.setLayoutProperty).toHaveBeenCalledWith('road-label', 'visibility', 'none');
    expect(double.getStyle).not.toHaveBeenCalled();

    controller.dispose();
    store.setMapStyle('standard');
    store.setAllLabelsVisibility(true);
  });

  it('skips the layer scan entirely on Standard', () => {
    const double = createMapDouble();
    const store = useProjectStore.getState();
    store.setMapStyle('standard');
    store.setDetectedCapabilities(STANDARD_CAPABILITIES);
    const controller = new BasemapController(double.map, vi.fn());
    controller.mount();
    controller.reconcile();
    expect(double.getStyle).not.toHaveBeenCalled();
    controller.dispose();
  });

  describe('map_style_load_failed', () => {
    const fireError = (double: ReturnType<typeof createMapDouble>, event: Record<string, unknown>) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      for (const listener of double.listeners.get('error') ?? []) listener(event);
    };
    const styleError = () => Object.assign(new Error('Forbidden'), { url: 'https://api.mapbox.com/styles/v1/x/y?access_token=pk.secret', status: 403 });

    it('reports style-level failures once per style, without URLs or tokens', () => {
      const double = createMapDouble();
      new BasemapController(double.map, vi.fn()).mount();
      useProjectStore.setState({ mapStyle: 'dark' });

      fireError(double, { error: styleError() });
      fireError(double, { error: styleError() });

      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenCalledWith('map_style_load_failed', { style: 'dark' });
      expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toContain('pk.secret');
    });

    it('ignores tile and source errors', () => {
      vi.mocked(track).mockClear();
      const double = createMapDouble();
      new BasemapController(double.map, vi.fn()).mount();
      useProjectStore.setState({ mapStyle: 'satellite' });

      fireError(double, { error: styleError(), sourceId: 'mapbox-dem' });
      fireError(double, { error: styleError(), tile: {} });
      fireError(double, { error: Object.assign(new Error('x'), { url: 'https://api.mapbox.com/v4/tiles/1.pbf' }) });

      expect(track).not.toHaveBeenCalled();
    });
  });
});

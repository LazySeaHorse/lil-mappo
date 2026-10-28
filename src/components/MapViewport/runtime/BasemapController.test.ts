import type { FogSpecification, Map as MapboxMap } from 'mapbox-gl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { STANDARD_CAPABILITIES, resolveFog } from '@/config/mapbox';
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
    getConfigProperty: vi.fn((_importId: string, _property: string): unknown => undefined),
    setConfigProperty: vi.fn(),
    getSchema: vi.fn((): Record<string, { default: unknown }> | null => null),
    getPaintProperty: vi.fn((_layerId: string, _property: string): unknown => undefined),
    setPaintProperty: vi.fn(),
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

  it('adds no buildings layer on classic styles', () => {
    const double = createMapDouble();
    const store = useProjectStore.getState();
    store.setBuildingsEnabled(true);
    store.setMapStyle('streets');
    const controller = new BasemapController(double.map, vi.fn());
    controller.mount();
    expect(double.addLayer).not.toHaveBeenCalled();
    expect(useProjectStore.getState().detectedCapabilities?.buildings3d).toBe(false);
    controller.dispose();
    store.setBuildingsEnabled(false);
    store.setMapStyle('standard');
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

  describe('custom style', () => {
    it('sets its Standard config and puts every property it does not set back to the default', () => {
      const double = createMapDouble();
      const config = new Map<string, unknown>();
      double.getConfigProperty.mockImplementation((_id, property) => config.get(property));
      double.setConfigProperty.mockImplementation((_id: string, property: string, value: unknown) => config.set(property, value));
      double.getSchema.mockReturnValue({
        theme: { default: 'default' },
        colorLand: { default: 'hsl(20, 20%, 95%)' },
        colorWater: { default: 'hsl(200, 100%, 80%)' },
        colorPointOfInterestLabels: { default: 'hsl(203, 7%, 55%)' },
        colorModePointOfInterestLabels: { default: 'default' },
      });
      const store = useProjectStore.getState();
      store.setMapStyle('standard', { name: 'Ink', colors: { land: '#112233', poiLabels: '#ffffff' }, theme: 'monochrome' });
      const controller = new BasemapController(double.map, vi.fn());
      controller.mount();

      expect(Object.fromEntries(config)).toMatchObject({
        theme: 'monochrome',
        colorLand: '#112233',
        colorWater: 'hsl(200, 100%, 80%)',
        colorPointOfInterestLabels: '#ffffff',
        colorModePointOfInterestLabels: 'single',
      });

      store.setMapStyle('standard');
      controller.reconcile();
      expect(Object.fromEntries(config)).toMatchObject({
        theme: 'default',
        colorLand: 'hsl(20, 20%, 95%)',
        colorPointOfInterestLabels: 'hsl(203, 7%, 55%)',
        colorModePointOfInterestLabels: 'default',
      });
      controller.dispose();
    });

    it('repaints classic layers from their own values and restores them when the style is dropped', () => {
      const double = createMapDouble();
      const original: Record<string, unknown> = {
        'land\u0000background-color': '#f0f0f0',
        'water\u0000fill-color': '#aaccff',
        'road-primary\u0000line-color': ['interpolate', ['linear'], ['zoom'], 10, '#ffffff', 14, '#eeeeee'],
        'road-primary-case\u0000line-color': '#cccccc',
      };
      const paint = new Map(Object.entries(original));
      double.getPaintProperty.mockImplementation((id, property) => paint.get(`${id}\u0000${property}`));
      double.setPaintProperty.mockImplementation((id: string, property: string, value: unknown) => paint.set(`${id}\u0000${property}`, value));
      double.getStyle.mockReturnValue({
        version: 8,
        sources: {},
        layers: [
          { id: 'land', type: 'background' },
          { id: 'water', type: 'fill', source: 'composite', 'source-layer': 'water' },
          { id: 'road-primary-case', type: 'line', source: 'composite', 'source-layer': 'road' },
          { id: 'road-primary', type: 'line', source: 'composite', 'source-layer': 'road' },
        ],
      });
      const store = useProjectStore.getState();
      store.setMapStyle('streets', { name: 'Night ink', colors: { land: '#101010', roads: '#ff0000' }, theme: 'default' });
      const controller = new BasemapController(double.map, vi.fn());
      controller.mount();

      expect(paint.get('land\u0000background-color')).toBe('#101010');
      expect(paint.get('road-primary-case\u0000line-color')).toBe('#101010');
      expect(paint.get('water\u0000fill-color')).toBe('#aaccff');
      const road = paint.get('road-primary\u0000line-color') as unknown[];
      expect(road.slice(0, 4)).toEqual(['interpolate', ['linear'], ['zoom'], 10]);
      expect(road[4]).toEqual(['match', ['get', 'class'], expect.arrayContaining(['primary']), '#ff0000', '#ffffff']);

      store.setMapStyle('streets', { name: 'Night ink', colors: { roads: '#00ff00' }, theme: 'default' });
      controller.reconcile();
      expect(paint.get('land\u0000background-color')).toBe('#f0f0f0');
      expect((paint.get('road-primary\u0000line-color') as unknown[])[4]).toEqual(['match', ['get', 'class'], expect.anything(), '#00ff00', '#ffffff']);

      store.setMapStyle('streets');
      controller.reconcile();
      expect(Object.fromEntries(paint)).toEqual(original);

      controller.dispose();
      store.setMapStyle('standard');
    });

    it('leaves classic paint alone when the project has no custom style', () => {
      const double = createMapDouble();
      double.getStyle.mockReturnValue({ version: 8, sources: {}, layers: [{ id: 'land', type: 'background' }] });
      useProjectStore.getState().setMapStyle('streets');
      const controller = new BasemapController(double.map, vi.fn());
      controller.mount();
      controller.reconcile();
      expect(double.getPaintProperty).not.toHaveBeenCalled();
      expect(double.setPaintProperty).not.toHaveBeenCalled();
      controller.dispose();
      useProjectStore.getState().setMapStyle('standard');
    });
  });

  describe('flag placement', () => {
    it('uses the bottom slot on Standard, under roads and labels', () => {
      const double = createMapDouble();
      useProjectStore.getState().setMapStyle('standard');
      const controller = new BasemapController(double.map, vi.fn());
      expect(controller.getFlagPlacement()).toEqual({ slot: 'bottom' });
      controller.dispose();
    });

    it('goes before the first road layer on classic styles, else the first symbol layer', () => {
      const store = useProjectStore.getState();
      store.setMapStyle('streets');
      const withRoads = createMapDouble();
      withRoads.getStyle.mockReturnValue({
        version: 8,
        sources: {},
        layers: [
          { id: 'land', type: 'background' },
          { id: 'water', type: 'fill', source: 'composite', 'source-layer': 'water' },
          { id: 'tunnel-street', type: 'line', source: 'composite', 'source-layer': 'road' },
          { id: 'road-street', type: 'line', source: 'composite', 'source-layer': 'road' },
          { id: 'road-label', type: 'symbol', source: 'composite', 'source-layer': 'road' },
        ],
      } as never);
      const roads = new BasemapController(withRoads.map, vi.fn());
      expect(roads.getFlagPlacement()).toEqual({ beforeId: 'tunnel-street' });
      roads.dispose();

      const noRoads = createMapDouble();
      noRoads.getStyle.mockReturnValue({
        version: 8,
        sources: {},
        layers: [{ id: 'satellite', type: 'raster', source: 'mapbox' }, { id: 'place-label', type: 'symbol', source: 'composite', 'source-layer': 'place_label' }],
      } as never);
      const satellite = new BasemapController(noRoads.map, vi.fn());
      expect(satellite.getFlagPlacement()).toEqual({ beforeId: 'place-label' });
      satellite.dispose();
      store.setMapStyle('standard');
    });
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

describe('fog', () => {
  const initial = {
    projection: useProjectStore.getState().projection,
    mapStyle: useProjectStore.getState().mapStyle,
    starIntensity: useProjectStore.getState().starIntensity,
    fogColor: useProjectStore.getState().fogColor,
    lightPreset: useProjectStore.getState().lightPreset,
  };

  afterEach(() => {
    useProjectStore.setState(initial);
  });

  /** A map that remembers the projection and fog it was given, like Mapbox does. */
  function createFogMap() {
    const double = createMapDouble();
    let fog: FogSpecification | undefined;
    let projection = useProjectStore.getState().projection;
    double.getProjection.mockImplementation((() => ({ name: projection })) as never);
    double.setProjection.mockImplementation(((next: { name: typeof projection }) => { projection = next.name; }) as never);
    double.getFog.mockImplementation((() => fog) as never);
    double.setFog.mockImplementation(((next: FogSpecification) => { fog = { ...fog, ...next }; }) as never);
    return { ...double, forgetFog: () => { fog = undefined; } };
  }
  const lastFog = (double: ReturnType<typeof createFogMap>) => double.setFog.mock.calls.at(-1)?.[0];

  describe('resolveFog', () => {
    const state = (overrides: Partial<Parameters<typeof resolveFog>[0]> = {}) => ({
      mapStyle: 'standard', projection: 'globe' as const, starIntensity: 0.6, fogColor: null, ...overrides,
    });

    it('keeps the globe look: stars, space color and user overrides', () => {
      expect(resolveFog(state())).toMatchObject({ 'star-intensity': 0.6, 'space-color': 'rgb(11, 11, 25)' });
      expect(resolveFog(state({ starIntensity: 0.25, fogColor: '#ff0000' }))).toMatchObject({
        color: '#ff0000',
        'star-intensity': 0.25,
        'space-color': 'rgb(11, 11, 25)',
      });
      expect(resolveFog(state({ mapStyle: 'dark' }))).toMatchObject({ 'star-intensity': 0.6, 'space-color': 'rgb(5, 5, 15)' });
      expect(resolveFog(state({ mapStyle: 'dark', starIntensity: 1 }))['star-intensity']).toBe(1);
    });

    it.each(['standard', 'streets', 'dark', 'satellite'])('has no stars in Mercator, whatever the star setting (%s)', (mapStyle) => {
      for (const starIntensity of [0, 0.6, 1]) {
        expect(resolveFog(state({ mapStyle, projection: 'mercator', starIntensity }))['star-intensity'], `stars ${starIntensity}`).toBe(0);
      }
    });

    it.each(['standard', 'dark', 'satellite'])('blends space into the haze in Mercator (%s)', (mapStyle) => {
      const globe = resolveFog(state({ mapStyle }));
      const fog = resolveFog(state({ mapStyle, projection: 'mercator' }));
      expect(fog['space-color']).toBe(fog.color);
      expect(fog.color).toBe(globe.color);
      expect(fog['high-color']).toBe(globe['high-color']);
      expect(fog['horizon-blend']).toBe(globe['horizon-blend']);
    });

    it('follows the fog color override in Mercator, for the haze and for the space beyond it', () => {
      const fog = resolveFog(state({ projection: 'mercator', fogColor: '#336699' }));
      expect(fog.color).toBe('#336699');
      expect(fog['space-color']).toBe('#336699');
    });
  });

  describe('reconcile', () => {
    function mount(overrides: Partial<typeof initial> = {}) {
      useProjectStore.setState({ mapStyle: 'standard', ...overrides });
      const double = createFogMap();
      const controller = new BasemapController(double.map, vi.fn());
      controller.mount();
      return { double, controller };
    }

    it('renders the satellite haze on satellite, and dark fog when Standard turns to night', () => {
      const satellite = mount({ mapStyle: 'satellite', projection: 'globe', lightPreset: 'day' });
      expect(lastFog(satellite.double)?.color).toBe('#5d7883');
      satellite.controller.dispose();

      const { double, controller } = mount({ projection: 'globe', lightPreset: 'day' });
      expect(lastFog(double)?.color).toBe('#bad2eb');
      useProjectStore.getState().setLightPreset('night');
      controller.reconcile();
      expect(lastFog(double)?.color).toBe('#171717');
      controller.dispose();
    });

    it('applies the Mercator fog when the project starts in Mercator', () => {
      const { double, controller } = mount({ projection: 'mercator', starIntensity: 0.9 });
      expect(lastFog(double)).toMatchObject({ 'star-intensity': 0, 'space-color': lastFog(double)?.color });
      controller.dispose();
    });

    it('re-applies the fog each time the projection switches, globe to Mercator and back', () => {
      const { double, controller } = mount({ projection: 'globe', starIntensity: 0.7 });
      expect(lastFog(double)).toMatchObject({ 'star-intensity': 0.7, 'space-color': 'rgb(11, 11, 25)' });

      useProjectStore.getState().setProjection('mercator');
      controller.reconcile();
      expect(lastFog(double)).toMatchObject({ 'star-intensity': 0, 'space-color': lastFog(double)?.color });
      expect(double.map.getFog()).toMatchObject({ 'star-intensity': 0 });

      useProjectStore.getState().setProjection('globe');
      controller.reconcile();
      expect(lastFog(double)).toMatchObject({ 'star-intensity': 0.7, 'space-color': 'rgb(11, 11, 25)' });
      expect(double.map.getFog()).toMatchObject({ 'star-intensity': 0.7 });

      useProjectStore.getState().setProjection('mercator');
      controller.reconcile();
      expect(double.map.getFog()).toMatchObject({ 'star-intensity': 0 });
      controller.dispose();
    });

    it('applies the Mercator fog even when the star setting is already 0 (only the space color changes)', () => {
      const { double, controller } = mount({ projection: 'globe', starIntensity: 0 });
      double.setFog.mockClear();
      useProjectStore.getState().setProjection('mercator');
      controller.reconcile();
      expect(double.setFog).toHaveBeenCalledTimes(1);
      expect(lastFog(double)?.['space-color']).toBe(lastFog(double)?.color);
      controller.dispose();
    });

    it('gives a freshly loaded Mercator style the Mercator fog', () => {
      const { double, controller } = mount({ projection: 'mercator' });
      double.setFog.mockClear();
      // A new style arrives with its own fog, not ours
      double.forgetFog();
      for (const listener of double.listeners.get('style.load')!) listener({});
      expect(double.setFog).toHaveBeenCalledTimes(1);
      expect(lastFog(double)).toMatchObject({ 'star-intensity': 0, 'space-color': lastFog(double)?.color });
      controller.dispose();
    });

    it('leaves the fog alone when nothing changed, and re-applies when only a haze field differs', () => {
      const { double, controller } = mount({ projection: 'mercator' });
      double.setFog.mockClear();
      controller.reconcile();
      expect(double.setFog).not.toHaveBeenCalled();

      double.getFog.mockReturnValue({ ...double.map.getFog(), 'horizon-blend': 0.5 } as never);
      controller.reconcile();
      expect(double.setFog).toHaveBeenCalledTimes(1);

      double.setFog.mockClear();
      double.getFog.mockReturnValue({ ...double.map.getFog(), 'high-color': 'rgb(1, 2, 3)' } as never);
      controller.reconcile();
      expect(double.setFog).toHaveBeenCalledTimes(1);
      controller.dispose();
    });

    it('ignores a star intensity differing by float noise', () => {
      const { double, controller } = mount({ projection: 'globe', starIntensity: 0.6 });
      double.setFog.mockClear();
      double.getFog.mockReturnValue({ ...double.map.getFog(), 'star-intensity': 0.6000001 } as never);
      controller.reconcile();
      expect(double.setFog).not.toHaveBeenCalled();
      controller.dispose();
    });
  });
});

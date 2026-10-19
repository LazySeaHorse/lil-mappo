import type { Map as MapboxMap } from 'mapbox-gl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { createProject, parseProjectDocument, toProjectDocument } from '@/store/projectDocument';
import { createTransientState } from '@/store/useProjectStore';
import { createModelItem } from '@/store/itemFactories';
import type { ModelAsset, RouteItem } from '@/store/types';
import { clearModelRegistry, modelStatus, registerModelBytes } from '@/models/modelRegistry';
import { MapSceneController } from './MapSceneController';
import { mapboxModelId } from './ModelCatalog';
import { createMapboxModels } from './testMapboxModels';

function createMapDouble() {
  const layers = new Map<string, { id: string; type: string; source?: string; layout?: Record<string, unknown> }>();
  const mapbox = createMapboxModels();
  const sources = new Map<string, { type: 'geojson'; setData: ReturnType<typeof vi.fn> }>();
  const listeners = mapbox.listeners;
  const control = () => ({ enable: vi.fn(), disable: vi.fn() });
  const state = useProjectStore.getState();
  let styleLoaded = true;

  const map = {
    layers,
    sources,
    listeners,
    mapbox,
    on: mapbox.api.on,
    off: mapbox.api.off,
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
    setLayoutProperty: vi.fn((id: string, prop: string, value: unknown) => {
      const layer = layers.get(id);
      if (layer) layer.layout = { ...layer.layout, [prop]: value };
    }),
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
    hasModel: mapbox.api.hasModel,
    addModel: mapbox.api.addModel,
    removeModel: mapbox.api.removeModel,
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

const SHA = 'e'.repeat(64);
const asset: ModelAsset = { id: 'a1', fileName: 'tower.glb', byteSize: 8, sha256: SHA, bounds: { min: [-1, 0, -1], max: [1, 4, 1] } };
const item = { ...createModelItem({ assetId: 'a1', name: 'Tower', position: [2, 48], startTime: 1 }), id: 'm1' };

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:tower'), revokeObjectURL: vi.fn() }));
  clearModelRegistry();
  useProjectStore.setState({
    ...createProject(),
    ...createTransientState(),
    models: { a1: asset },
    items: { m1: item },
    itemOrder: ['m1'],
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('MapSceneController with imported models', () => {
  it('skips a model whose file is missing, and draws it once the file is relinked', () => {
    const double = createMapDouble();
    const controller = new MapSceneController(double.map, vi.fn());
    try {
      controller.mount();
      expect(() => controller.renderAt(3)).not.toThrow();
      expect(double.layers.has('model-layer-m1')).toBe(false);

      registerModelBytes(SHA, new ArrayBuffer(8));
      expect(double.layers.get('model-layer-m1')?.type).toBe('model');
      expect(double.mapbox.requested.get(mapboxModelId(SHA))).toBe('blob:tower');
    } finally {
      controller.dispose();
    }
  });

  it('draws the model for export at the frame time, and removes it with its item', () => {
    registerModelBytes(SHA, new ArrayBuffer(8));
    const double = createMapDouble();
    const controller = new MapSceneController(double.map, vi.fn());
    try {
      controller.mount();
      controller.renderAt(0);
      expect(double.layers.get('model-layer-m1')?.layout?.visibility).toBe('none');
      controller.renderAt(3);
      expect(double.layers.get('model-layer-m1')?.layout?.visibility).toBe('visible');

      useProjectStore.getState().removeItem('m1');
      expect(double.layers.has('model-layer-m1')).toBe(false);
      // Removed while its load was pending: it leaves the style as soon as the load lands.
      double.mapbox.finishLoads();
      expect(double.mapbox.inStyle().size).toBe(0);
    } finally {
      controller.dispose();
    }
  });

  it('stops drawing a model Mapbox could not load, and marks its file failed', () => {
    registerModelBytes(SHA, new ArrayBuffer(8));
    const double = createMapDouble();
    const controller = new MapSceneController(double.map, vi.fn());
    try {
      controller.mount();
      expect(double.layers.get('model-layer-m1')?.type).toBe('model');
      double.mapbox.failLoad(mapboxModelId(SHA));
      expect(modelStatus(asset)).toBe('failed');
      expect(double.layers.has('model-layer-m1')).toBe(false);
      expect(() => controller.renderAt(3)).not.toThrow();
    } finally {
      controller.dispose();
    }
  });

  it('renders a cloud job (project_data, no model files) without the models and with dot markers', () => {
    const route: RouteItem = {
      kind: 'route', id: 'r1', name: 'Bus',
      geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }] },
      startTime: 0, endTime: 5,
      style: { color: '#123456', width: 4, glow: false, glowWidth: 12, dashPattern: null, animationType: 'draw', cometTrailLength: 0.2 },
      easing: 'linear', exitAnimation: 'none',
      calculation: { mode: 'car', startPoint: [0, 0], endPoint: [1, 1], startName: '', endName: '', vehicle: { enabled: true, type: 'custom', modelId: 'a1', scale: 2 } },
    };
    useProjectStore.setState((st) => ({ items: { ...createProject().items, ...st.items } }));
    useProjectStore.getState().addItem(route);
    // What the cloud renderer receives: the document, which has no bytes.
    const projectData = JSON.parse(JSON.stringify(toProjectDocument(useProjectStore.getState())));
    useProjectStore.getState().loadFullProject(parseProjectDocument(projectData));
    useProjectStore.getState().setIsExporting(true);

    const double = createMapDouble();
    const controller = new MapSceneController(double.map, vi.fn());
    try {
      controller.mount();
      for (let t = 0; t <= 6; t += 0.5) expect(() => controller.renderAt(t)).not.toThrow();
      expect(double.layers.has('model-layer-m1')).toBe(false);
      expect(double.layers.get('vehicle-layer-r1')?.type).toBe('circle');
      expect(double.addModel).not.toHaveBeenCalled();
    } finally {
      controller.dispose();
    }
  });
});

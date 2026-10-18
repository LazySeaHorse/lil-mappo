import type { Map as MapboxMap } from 'mapbox-gl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { createProject } from '@/store/projectDocument';
import { createTransientState } from '@/store/useProjectStore';
import { createModelItem } from '@/store/itemFactories';
import type { ModelAsset } from '@/store/types';
import { clearModelRegistry, registerModelBytes } from '@/models/modelRegistry';
import { MapSceneController } from './MapSceneController';
import { mapboxModelId } from './ModelCatalog';

function createMapDouble() {
  const layers = new Map<string, { id: string; type: string; source?: string; layout?: Record<string, unknown> }>();
  const models = new Map<string, string>();
  const sources = new Map<string, { type: 'geojson'; setData: ReturnType<typeof vi.fn> }>();
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const control = () => ({ enable: vi.fn(), disable: vi.fn() });
  const state = useProjectStore.getState();
  let styleLoaded = true;

  const map = {
    layers,
    sources,
    listeners,
    models,
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
    hasModel: vi.fn((id: string) => models.has(id)),
    addModel: vi.fn((id: string, url: string) => models.set(id, url)),
    removeModel: vi.fn((id: string) => models.delete(id)),
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
      expect(double.models.get(mapboxModelId(SHA))).toBe('blob:tower');
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
      expect(double.models.size).toBe(0);
    } finally {
      controller.dispose();
    }
  });
});

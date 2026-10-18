import type { Map as MapboxMap } from 'mapbox-gl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createModelItem } from '@/store/itemFactories';
import type { ModelAsset, ModelItem } from '@/store/types';
import { clearModelRegistry, registerModelBytes } from '@/models/modelRegistry';
import { ModelCatalog, mapboxModelId } from './ModelCatalog';
import { ModelRenderer } from './ModelRenderer';

type Layer = { id: string; type: string; source?: string; layout?: Record<string, unknown>; paint?: Record<string, unknown> };

function createMapDouble() {
  const layers = new Map<string, Layer>();
  const sources = new Map<string, { type: 'geojson'; setData: ReturnType<typeof vi.fn> }>();
  const models = new Map<string, string>();
  const map = {
    isStyleLoaded: vi.fn(() => true),
    getLayer: vi.fn((id: string) => layers.get(id)),
    addLayer: vi.fn((layer: Layer) => layers.set(layer.id, layer)),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    getLayoutProperty: vi.fn((id: string, prop: string) => layers.get(id)?.layout?.[prop]),
    setLayoutProperty: vi.fn((id: string, prop: string, val: unknown) => {
      const l = layers.get(id);
      if (l) l.layout = { ...(l.layout || {}), [prop]: val };
    }),
    setPaintProperty: vi.fn((id: string, prop: string, val: unknown) => {
      const l = layers.get(id);
      if (l) l.paint = { ...(l.paint || {}), [prop]: val };
    }),
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string) => sources.set(id, { type: 'geojson', setData: vi.fn() })),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    hasModel: vi.fn((id: string) => models.has(id)),
    addModel: vi.fn((id: string, url: string) => models.set(id, url)),
    removeModel: vi.fn((id: string) => models.delete(id)),
  };
  return { map: map as unknown as MapboxMap, layers, sources, models, double: map };
}

const SHA = 'c'.repeat(64);
const asset: ModelAsset = {
  id: 'a1', fileName: 'tower.glb', byteSize: 10, sha256: SHA,
  // Origin 2 m above its lowest point.
  bounds: { min: [-1, -2, -1], max: [1, 8, 1] },
};

function placed(patch: Partial<ModelItem> = {}): ModelItem {
  return {
    ...createModelItem({ assetId: 'a1', name: 'Tower', position: [2.29, 48.86], startTime: 10 }),
    id: 'm1',
    endTime: 20,
    altitude: 5,
    heading: 30,
    pitch: 10,
    roll: 0,
    scale: 3,
    transition: { enter: 'rise', exit: 'fade', enterDuration: 1, exitDuration: 1 },
    ...patch,
  };
}

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:tower'), revokeObjectURL: vi.fn() }));
  clearModelRegistry();
});

afterEach(() => vi.unstubAllGlobals());

describe('ModelRenderer', () => {
  it('draws nothing while the model file is missing, and the model once it is relinked', () => {
    const { map, layers, models } = createMapDouble();
    const catalog = new ModelCatalog(map, () => ({ a1: asset }));
    const renderer = new ModelRenderer(map, placed(), catalog);
    renderer.mount();
    renderer.render(15);
    expect(layers.size).toBe(0);
    expect(models.size).toBe(0);

    registerModelBytes(SHA, new ArrayBuffer(8));
    renderer.refresh();
    const layer = layers.get('model-layer-m1')!;
    expect(layer.type).toBe('model');
    expect(layer.layout?.['model-id']).toBe(mapboxModelId(SHA));
    expect(models.get(mapboxModelId(SHA))).toBe('blob:tower');
  });

  it('places, turns, sizes and lifts the model so it stands at its altitude', () => {
    registerModelBytes(SHA, new ArrayBuffer(8));
    const { map, layers } = createMapDouble();
    const renderer = new ModelRenderer(map, placed(), new ModelCatalog(map, () => ({ a1: asset })));
    renderer.mount();
    renderer.render(15);
    const paint = layers.get('model-layer-m1')!.paint!;
    expect(layers.get('model-layer-m1')!.layout?.visibility).not.toBe('none');
    expect(paint['model-scale']).toEqual([3, 3, 3]);
    expect(paint['model-rotation']).toEqual([0, -10, 30]);
    // 5 m up, plus its 2 m below the origin at 3x.
    expect(paint['model-translation']).toEqual([0, 0, 11]);
    expect(paint['model-opacity']).toBe(1);
  });

  it('hides the model outside its time and plays its animations', () => {
    registerModelBytes(SHA, new ArrayBuffer(8));
    const { map, layers } = createMapDouble();
    const renderer = new ModelRenderer(map, placed(), new ModelCatalog(map, () => ({ a1: asset })));
    renderer.mount();
    renderer.render(5);
    expect(layers.get('model-layer-m1')!.layout?.visibility).toBe('none');

    renderer.render(10.5);
    const rising = layers.get('model-layer-m1')!.paint!;
    expect((rising['model-scale'] as number[])[2]).toBeLessThan(3);
    expect((rising['model-scale'] as number[])[0]).toBe(3);

    renderer.render(19.5);
    expect(layers.get('model-layer-m1')!.paint!['model-opacity']).toBeCloseTo(0.5);
  });

  it('shows a settled model in full off its time (the editor previewing the selection)', () => {
    registerModelBytes(SHA, new ArrayBuffer(8));
    const { map, layers } = createMapDouble();
    const renderer = new ModelRenderer(map, placed(), new ModelCatalog(map, () => ({ a1: asset })));
    renderer.mount();
    renderer.render(2);
    expect(layers.get('model-layer-m1')!.layout?.visibility).toBe('none');
    renderer.render(2, { settled: true });
    expect(layers.get('model-layer-m1')!.layout?.visibility).toBe('visible');
  });

  it('moves the point when the model is moved', () => {
    registerModelBytes(SHA, new ArrayBuffer(8));
    const { map, sources } = createMapDouble();
    const renderer = new ModelRenderer(map, placed(), new ModelCatalog(map, () => ({ a1: asset })));
    renderer.mount();
    renderer.setItem(placed({ position: [3, 40] }));
    expect(sources.get('model-source-m1')!.setData).toHaveBeenLastCalledWith(
      expect.objectContaining({ geometry: { type: 'Point', coordinates: [3, 40] } }),
    );
  });

  it('removes its layer and source, and the catalog drops models nothing uses', () => {
    registerModelBytes(SHA, new ArrayBuffer(8));
    const { map, layers, sources, models } = createMapDouble();
    const catalog = new ModelCatalog(map, () => ({ a1: asset }));
    const renderer = new ModelRenderer(map, placed(), catalog);
    renderer.mount();
    catalog.prune({ m1: placed() });
    expect(models.size).toBe(1);

    renderer.dispose();
    catalog.prune({});
    expect(layers.size).toBe(0);
    expect(sources.size).toBe(0);
    expect(models.size).toBe(0);
  });
});

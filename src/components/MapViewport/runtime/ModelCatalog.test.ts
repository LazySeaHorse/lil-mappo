import type { Map as MapboxMap } from 'mapbox-gl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createModelItem } from '@/store/itemFactories';
import type { ModelAsset, TimelineItem } from '@/store/types';
import { clearModelRegistry, registerModelBytes } from '@/models/modelRegistry';
import { ModelCatalog, mapboxModelId } from './ModelCatalog';
import { createMapboxModels } from './testMapboxModels';

const SHA = 'd'.repeat(64);
const MODEL_ID = mapboxModelId(SHA);
const asset: ModelAsset = { id: 'a1', fileName: 'tower.glb', byteSize: 8, sha256: SHA, bounds: { min: [0, 0, 0], max: [1, 1, 1] } };
const using: Record<string, TimelineItem> = {
  m1: { ...createModelItem({ assetId: 'a1', name: 'Tower', position: [0, 0], startTime: 0 }), id: 'm1' },
};

function setup() {
  const mapbox = createMapboxModels();
  const map = { ...mapbox.api, isStyleLoaded: vi.fn(() => true) } as unknown as MapboxMap;
  const catalog = new ModelCatalog(map, () => ({ a1: asset }));
  catalog.attach();
  return { mapbox, catalog };
}

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:tower'), revokeObjectURL: vi.fn() }));
  clearModelRegistry();
  registerModelBytes(SHA, new ArrayBuffer(8));
});

afterEach(() => vi.unstubAllGlobals());

describe('ModelCatalog', () => {
  it('adds a model to the style once, however often it is looked up while it loads', () => {
    const { mapbox, catalog } = setup();
    for (let i = 0; i < 5; i++) expect(catalog.resolve('a1')).toEqual({ modelId: MODEL_ID, asset });
    expect(mapbox.api.addModel).toHaveBeenCalledTimes(1);
    mapbox.finishLoads();
    catalog.resolve('a1');
    expect(mapbox.api.addModel).toHaveBeenCalledTimes(1);
  });

  it('removes a loaded model nothing uses', () => {
    const { mapbox, catalog } = setup();
    catalog.resolve('a1');
    mapbox.finishLoads();
    catalog.prune(using);
    expect(mapbox.inStyle()).toEqual(new Set([MODEL_ID]));
    catalog.prune({});
    expect(mapbox.api.removeModel).toHaveBeenCalledWith(MODEL_ID);
    expect(mapbox.inStyle().size).toBe(0);
  });

  it('removes a model dropped while it was still loading, once its load lands', () => {
    const { mapbox, catalog } = setup();
    catalog.resolve('a1');
    catalog.prune({});
    // Mapbox cannot remove a pending model, so the catalog must not try yet.
    expect(mapbox.api.removeModel).not.toHaveBeenCalled();
    mapbox.finishLoads();
    expect(mapbox.api.removeModel).toHaveBeenCalledWith(MODEL_ID);
    expect(mapbox.inStyle().size).toBe(0);
  });

  it('keeps a model that is needed again before its pending removal lands', () => {
    const { mapbox, catalog } = setup();
    catalog.resolve('a1');
    catalog.prune({});
    catalog.resolve('a1');
    mapbox.finishLoads();
    expect(mapbox.api.removeModel).not.toHaveBeenCalled();
    expect(mapbox.api.addModel).toHaveBeenCalledTimes(1);
    expect(mapbox.inStyle()).toEqual(new Set([MODEL_ID]));
  });

  it('adds a removed model again when it is needed again', () => {
    const { mapbox, catalog } = setup();
    catalog.resolve('a1');
    mapbox.finishLoads();
    catalog.prune({});
    catalog.resolve('a1');
    expect(mapbox.api.addModel).toHaveBeenCalledTimes(2);
    expect(mapbox.inStyle()).toEqual(new Set([MODEL_ID]));
  });

  it('adds every model again to a replaced style', () => {
    const { mapbox, catalog } = setup();
    catalog.resolve('a1');
    mapbox.finishLoads();
    mapbox.requested.clear();
    mapbox.loaded.clear();
    catalog.reset();
    catalog.resolve('a1');
    expect(mapbox.api.addModel).toHaveBeenCalledTimes(2);
  });

  it('stops listening to the map when detached', () => {
    const { mapbox, catalog } = setup();
    catalog.detach();
    expect([...mapbox.listeners.values()].every((group) => group.size === 0)).toBe(true);
  });
});

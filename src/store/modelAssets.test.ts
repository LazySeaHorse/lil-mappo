import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore, createTransientState } from './useProjectStore';
import { createProject } from './projectDocument';
import { clearHistory, undo } from './history';
import { createModelItem, createImportedRouteItem } from './itemFactories';
import { pruneModels, referencedModelIds } from './modelAssets';
import type { ModelAsset, RouteItem } from './types';

const asset = (id: string, sha = id.padEnd(64, '0')): ModelAsset => ({
  id,
  fileName: `${id}.glb`,
  byteSize: 100,
  sha256: sha,
  bounds: { min: [-1, 0, -1], max: [1, 2, 1] },
});

const customRoute = (modelId: string): RouteItem => {
  const route = createImportedRouteItem({
    name: 'Drive',
    geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }] },
    startTime: 0,
  });
  return {
    ...route,
    calculation: {
      mode: 'car', startPoint: [0, 0], endPoint: [1, 1], startName: '', endName: '',
      vehicle: { enabled: true, type: 'custom', modelId, scale: 1 },
    },
  };
};

describe('imported model assets in the store', () => {
  beforeEach(() => {
    useProjectStore.setState({ ...createProject(), ...createTransientState() });
    clearHistory();
  });

  it('creates a model item with the shared defaults', () => {
    const item = createModelItem({ assetId: 'a1', name: 'Tower', position: [2, 48], startTime: 3 });
    expect(item).toMatchObject({
      kind: 'model', assetId: 'a1', name: 'Tower', position: [2, 48],
      altitude: 0, heading: 0, pitch: 0, roll: 0, scale: 1, startTime: 3, endTime: 8,
      transition: { enter: 'fade', exit: 'fade', enterDuration: 0.5, exitDuration: 0.5 },
    });
  });

  it('adds the asset and its item in one undo step', () => {
    const item = createModelItem({ assetId: 'a1', name: 'Tower', position: [0, 0], startTime: 0 });
    useProjectStore.getState().addModel(asset('a1'), item);
    const state = useProjectStore.getState();
    expect(state.models.a1).toEqual(asset('a1'));
    expect(state.itemOrder).toContain(item.id);

    undo();
    expect(useProjectStore.getState().models).toEqual({});
    expect(useProjectStore.getState().items[item.id]).toBeUndefined();
  });

  it('drops the asset when the last item that uses it is deleted, and undo brings both back', () => {
    const a = createModelItem({ assetId: 'a1', name: 'A', position: [0, 0], startTime: 0 });
    const b = createModelItem({ assetId: 'a1', name: 'B', position: [0, 0], startTime: 0 });
    useProjectStore.getState().addModel(asset('a1'), a);
    useProjectStore.getState().addItem(b);

    useProjectStore.getState().removeItem(a.id);
    expect(useProjectStore.getState().models.a1).toBeDefined();

    useProjectStore.getState().removeItem(b.id);
    expect(useProjectStore.getState().models.a1).toBeUndefined();

    undo();
    expect(useProjectStore.getState().models.a1).toBeDefined();
    expect(useProjectStore.getState().items[b.id]).toBeDefined();
  });

  it('keeps an asset that a route marker still rides', () => {
    const route = customRoute('a1');
    const item = createModelItem({ assetId: 'a1', name: 'A', position: [0, 0], startTime: 0 });
    useProjectStore.getState().addModel(asset('a1'), item);
    useProjectStore.getState().addItem(route);
    useProjectStore.getState().removeItem(item.id);
    expect(useProjectStore.getState().models.a1).toBeDefined();

    // Switching the marker away from the model lets it go.
    useProjectStore.getState().updateItem(route.id, {
      calculation: { ...route.calculation!, vehicle: { enabled: true, type: 'dot', modelId: '', scale: 1 } },
    });
    expect(useProjectStore.getState().models.a1).toBeUndefined();
  });

  it('adds only the asset for a route marker', () => {
    useProjectStore.getState().addModel(asset('a1'));
    // Nothing uses it yet: it is kept until an edit leaves it unused.
    expect(useProjectStore.getState().models.a1).toBeDefined();
  });

  it('relinks an asset to a different file in place', () => {
    const item = createModelItem({ assetId: 'a1', name: 'A', position: [0, 0], startTime: 0 });
    useProjectStore.getState().addModel(asset('a1'), item);
    useProjectStore.getState().relinkModel('a1', {
      fileName: 'new.glb', byteSize: 5, sha256: 'f'.repeat(64), bounds: { min: [0, 0, 0], max: [3, 3, 3] },
    });
    expect(useProjectStore.getState().models.a1).toEqual({
      id: 'a1', fileName: 'new.glb', byteSize: 5, sha256: 'f'.repeat(64), bounds: { min: [0, 0, 0], max: [3, 3, 3] },
    });
  });

  it('lists the models that items and markers use', () => {
    const items = {
      m: createModelItem({ assetId: 'a1', name: 'A', position: [0, 0], startTime: 0 }),
      r: customRoute('a2'),
    };
    expect([...referencedModelIds(items)].sort()).toEqual(['a1', 'a2']);
    const models = { a1: asset('a1'), a2: asset('a2'), a3: asset('a3') };
    expect(Object.keys(pruneModels(items, models)).sort()).toEqual(['a1', 'a2']);
    const kept = { a1: models.a1, a2: models.a2 };
    expect(pruneModels(items, kept)).toBe(kept);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createModelItem } from '@/store/itemFactories';
import type { ModelAsset, ModelItem } from '@/store/types';
import { clearModelRegistry, registerModelBytes } from '@/models/modelRegistry';
import { ModelCatalog, mapboxModelId } from './ModelCatalog';
import { ModelRenderer } from './ModelRenderer';
import { createMapboxModels } from './testMapboxModels';
import { createModelLayerMap } from './testMapboxModelLayer';

function createMapDouble() {
  const setup = createModelLayerMap();
  const mapbox = createMapboxModels();
  Object.assign(setup.double, mapbox.api);
  return { ...setup, mapbox };
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
    const { map, layers, sources, mapbox } = createMapDouble();
    const catalog = new ModelCatalog(map, () => ({ a1: asset }));
    const renderer = new ModelRenderer(map, placed(), catalog);
    renderer.mount();
    renderer.render(15);
    expect(layers.size).toBe(0);
    expect(mapbox.requested.size).toBe(0);

    registerModelBytes(SHA, new ArrayBuffer(8));
    renderer.refresh();
    const layer = layers.get('model-layer-m1')!;
    expect(layer.type).toBe('model');
    // Drawn from a model source that loads the file itself; the catalog keeps it in the style too.
    expect(sources.get('model-source-m1')!.models?.model.uri).toBe('blob:tower');
    expect(mapbox.requested.get(mapboxModelId(SHA))).toBe('blob:tower');
  });

  it('places, turns, sizes and lifts the model so it stands at its altitude', () => {
    registerModelBytes(SHA, new ArrayBuffer(8));
    const { map, layers, sources } = createMapDouble();
    const renderer = new ModelRenderer(map, placed(), new ModelCatalog(map, () => ({ a1: asset })));
    renderer.mount();
    renderer.render(15);
    const paint = layers.get('model-layer-m1')!.paint!;
    const model = sources.get('model-source-m1')!.models!.model;
    expect(layers.get('model-layer-m1')!.layout?.visibility).not.toBe('none');
    expect(paint['model-scale']).toEqual([3, 3, 3]);
    // Turned by its orientation [roll, -pitch, heading], never model-rotation (ModelRenderer.drawn.test.ts).
    expect(model.orientation).toEqual([0, -10, 30]);
    expect(paint['model-rotation']).toBeUndefined();
    expect(model.position).toEqual([2.29, 48.86]);
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

  it('moves the model when it is moved', () => {
    registerModelBytes(SHA, new ArrayBuffer(8));
    const { map, sources } = createMapDouble();
    const renderer = new ModelRenderer(map, placed(), new ModelCatalog(map, () => ({ a1: asset })));
    renderer.mount();
    renderer.setItem(placed({ position: [3, 40] }));
    expect(sources.get('model-source-m1')!.setModels).toHaveBeenLastCalledWith(
      { model: expect.objectContaining({ position: [3, 40], orientation: [0, -10, 30] }) },
    );
  });

  it('removes its layer and source, and the catalog drops models nothing uses', () => {
    registerModelBytes(SHA, new ArrayBuffer(8));
    const { map, layers, sources, mapbox } = createMapDouble();
    const catalog = new ModelCatalog(map, () => ({ a1: asset }));
    catalog.attach();
    const renderer = new ModelRenderer(map, placed(), catalog);
    renderer.mount();
    mapbox.finishLoads();
    catalog.prune({ m1: placed() });
    expect(mapbox.inStyle().size).toBe(1);

    renderer.dispose();
    catalog.prune({});
    expect(layers.size).toBe(0);
    expect(sources.size).toBe(0);
    expect(mapbox.inStyle().size).toBe(0);
  });
});

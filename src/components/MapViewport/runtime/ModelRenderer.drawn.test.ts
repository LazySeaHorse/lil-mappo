import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createModelItem } from '@/store/itemFactories';
import type { ModelAsset, ModelItem } from '@/store/types';
import { clearModelRegistry, registerModelBytes } from '@/models/modelRegistry';
import { modelFrame } from '@/models/modelAnimation';
import { modelExtent } from '@/models/modelGeometry';
import { modelSourceMatrix } from '@/test/mapboxModelMath';
import { ModelCatalog } from './ModelCatalog';
import { ModelRenderer } from './ModelRenderer';
import { createMapboxModels } from './testMapboxModels';
import { createModelLayerMap, type Projection } from './testMapboxModelLayer';

/**
 * A placed 3D model must be DRAWN at its heading, pitch, roll, size, altitude and opacity, in globe
 * and mercator projection, as Mapbox's own model math places it (testMapboxModelLayer), straight
 * after each edit or frame, with no camera move. On a GeoJSON source the globe draw path drops a
 * model's rotation, so a placed model always faced north, upright, when the map was zoomed out.
 */

const SHA = 'c'.repeat(64);
const asset: ModelAsset = {
  id: 'a1', fileName: 'tower.glb', byteSize: 10, sha256: SHA,
  // Origin 2 m above its lowest point.
  bounds: { min: [-1, -2, -1], max: [1, 8, 1] },
};
const LAYER = 'model-layer-m1';

function placed(patch: Partial<ModelItem> = {}): ModelItem {
  return {
    ...createModelItem({ assetId: 'a1', name: 'Tower', position: [2.29, 48.86], startTime: 10 }),
    id: 'm1',
    endTime: 20,
    altitude: 5,
    heading: 30,
    pitch: 10,
    roll: 4,
    scale: 3,
    transition: { enter: 'rise', exit: 'fade', enterDuration: 1, exitDuration: 1 },
    ...patch,
  };
}

function setup(item = placed()) {
  const models = createMapboxModels();
  const mapbox = createModelLayerMap();
  Object.assign(mapbox.double, models.api);
  const renderer = new ModelRenderer(mapbox.map, item, new ModelCatalog(mapbox.map, () => ({ a1: asset })));
  return { ...mapbox, models, renderer };
}

/** Asserts Mapbox draws `item` at `time` where and how the item says, in `projection`. */
function expectDrawnAsItem(s: ReturnType<typeof setup>, item: ModelItem, time: number, projection: Projection, settled = false) {
  const frame = modelFrame(item, time, { settled })!;
  const drawn = s.drawn(LAYER, projection);
  const at = `t=${time} (${projection})`;
  expect(drawn, at).not.toBeNull();
  const z = item.scale * frame.scale * frame.height;
  const xy = item.scale * frame.scale;
  const want = modelSourceMatrix([item.roll, -item.pitch, item.heading], [0, 0, 0], [xy, xy, z]);
  drawn!.matrix.forEach((v, i) => expect(v, `${at} matrix[${i}]`).toBeCloseTo(want[i], 6));
  expect(drawn!.translation, at).toEqual([0, 0, item.altitude + modelExtent(asset.bounds).lift * z]);
  expect(drawn!.opacity, at).toBeCloseTo(frame.opacity, 6);
  expect(drawn!.position, at).toEqual(item.position);
}

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:tower'), revokeObjectURL: vi.fn() }));
  clearModelRegistry();
  registerModelBytes(SHA, new ArrayBuffer(8));
});

afterEach(() => vi.unstubAllGlobals());

describe.each(['globe', 'mercator'] as const)('a placed model is drawn as placed, in %s projection', (projection) => {
  it('through its rise, while shown, and through its fade, with the playhead jumping about', () => {
    const s = setup();
    s.renderer.mount();
    for (const t of [15, 10.5, 19.5, 10.2, 12, 19.9, 15, 15]) {
      s.renderer.render(t);
      expectDrawnAsItem(s, placed(), t, projection);
    }
    s.renderer.render(5);
    expect(s.drawn(LAYER, projection)).toBeNull();
    s.renderer.render(2, { settled: true });
    expectDrawnAsItem(s, placed(), 2, projection, true);
  });

  it.each([
    ['turned', { heading: 250 }],
    ['tipped', { pitch: -35 }],
    ['rolled', { roll: 20 }],
    ['grown', { scale: 7.5 }],
    ['raised', { altitude: 120 }],
    ['moved', { position: [3, 40] as [number, number] }],
    ['turned back to north', { heading: 0, pitch: 0, roll: 0 }],
  ])('straight after it is %s in the editor', (_name, patch) => {
    const s = setup();
    s.renderer.mount();
    s.renderer.render(15);
    const edited = placed(patch);
    s.renderer.setItem(edited);
    s.renderer.render(15);
    expectDrawnAsItem(s, edited, 15, projection);
  });

  it('after a remount and after its file is relinked', () => {
    const s = setup();
    s.renderer.mount();
    s.renderer.render(15);
    s.renderer.dispose();
    expect(s.layers.size).toBe(0);
    expect(s.sources.size).toBe(0);
    s.renderer.mount();
    s.renderer.render(15);
    expectDrawnAsItem(s, placed(), 15, projection);

    s.renderer.refresh();
    s.renderer.render(16);
    expectDrawnAsItem(s, placed(), 16, projection);
  });
});

describe('a placed model on the map', () => {
  it('adds sources and layers Mapbox accepts', () => {
    const s = setup();
    s.renderer.mount();
    s.renderer.render(15);
    expect(s.validate()).toEqual([]);
  });

  it('is never turned through model-rotation (guard)', () => {
    // On a GeoJSON source Mapbox bakes model-rotation into tile buckets and its globe draw path
    // drops the angle, so a placed model faced north whenever the map was zoomed out. Heading,
    // pitch and roll must travel with the model (its orientation in a model source) instead.
    const s = setup();
    s.renderer.mount();
    for (const t of [10.5, 15, 19.5]) s.renderer.render(t);
    s.renderer.setItem(placed({ heading: 90, pitch: 5, roll: 5 }));
    s.renderer.render(15);
    const writes = s.double.setPaintProperty.mock.calls.filter(([id, prop]) => id === LAYER && prop === 'model-rotation');
    expect(writes).toEqual([]);
    for (const [spec] of s.double.addLayer.mock.calls) {
      if (spec.id !== LAYER) continue;
      const rotation = spec.paint?.['model-rotation'];
      expect(rotation === undefined || (Array.isArray(rotation) && rotation.every((v: unknown) => v === 0))).toBe(true);
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { createProject } from '@/store/projectDocument';
import { clearHistory, undo } from '@/store/history';
import type { ModelItem } from '@/store/types';
import { makeGlb } from './testGlb';
import { acceptRelink, importModel, readModelAsset, relinkModel } from './modelImport';
import { clearModelRegistry, getLoadedModel, isModelReady, useModelRegistry } from './modelRegistry';
import { installModelRetention, modelHashesInUse } from './modelRetention';
import { ModelFileError } from './glb';

const glbFile = (name: string, max: [number, number, number] = [1, 2, 3]) =>
  new File([makeGlb({ nodes: [{ mesh: 0 }], min: [0, 0, 0], max })], name);

let urls = 0;
const createObjectURL = vi.fn(() => `blob:model-${++urls}`);
const revokeObjectURL = vi.fn();

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  clearModelRegistry();
  useProjectStore.setState({ ...createProject(), ...createTransientState() });
  clearHistory();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('importing a model', () => {
  it('keeps the bytes in memory and only metadata in the project', async () => {
    const item = await importModel(glbFile('Eiffel_Tower.glb'), { position: [2.29, 48.86], startTime: 2 });
    const state = useProjectStore.getState();
    const asset = state.models[item.assetId];
    expect(item).toMatchObject({ kind: 'model', name: 'Eiffel_Tower', position: [2.29, 48.86], startTime: 2 });
    expect(asset).toMatchObject({ fileName: 'Eiffel_Tower.glb', bounds: { min: [0, 0, 0], max: [1, 2, 3] } });
    expect(isModelReady(asset)).toBe(true);
    expect(getLoadedModel(asset.sha256)?.url).toMatch(/^blob:/);
    expect(JSON.stringify(state.models)).not.toContain('blob:');
  });

  it('reuses the asset when the same file is imported again', async () => {
    const a = await importModel(glbFile('a.glb'), { position: [0, 0], startTime: 0 });
    const b = await importModel(glbFile('copy.glb'), { position: [1, 1], startTime: 0 });
    expect(b.assetId).toBe(a.assetId);
    expect(Object.keys(useProjectStore.getState().models)).toHaveLength(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('adds nothing for a file that is not a model', async () => {
    await expect(importModel(new File(['nope'], 'tower.obj'), { position: [0, 0], startTime: 0 })).rejects.toBeInstanceOf(ModelFileError);
    await expect(importModel(new File(['not a glb at all, just text'], 'tower.glb'), { position: [0, 0], startTime: 0 })).rejects.toBeInstanceOf(ModelFileError);
    expect(useProjectStore.getState().models).toEqual({});
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('reads a model for a route marker without placing it', async () => {
    const asset = await readModelAsset(glbFile('bus.glb'));
    expect(isModelReady(asset)).toBe(true);
    expect(Object.keys(useProjectStore.getState().items)).toHaveLength(1); // the camera track only
  });
});

describe('a reloaded project', () => {
  async function savedAndReloaded() {
    const item = await importModel(glbFile('tower.glb'), { position: [0, 0], startTime: 0 });
    const saved = JSON.parse(JSON.stringify(useProjectStore.getState()));
    clearModelRegistry();
    useProjectStore.getState().loadFullProject(saved);
    const asset = useProjectStore.getState().models[item.assetId];
    return { item, asset };
  }

  it('shows its models as missing until they are relinked', async () => {
    const { asset } = await savedAndReloaded();
    expect(asset).toBeDefined();
    expect(isModelReady(asset)).toBe(false);

    expect(await relinkModel(asset, glbFile('renamed.glb'))).toEqual({ status: 'linked' });
    expect(isModelReady(asset)).toBe(true);
    // Same bytes: the project is not changed.
    expect(useProjectStore.getState().models[asset.id]).toEqual(asset);
  });

  it('warns when the picked file is a different model, and uses it when the user accepts', async () => {
    const { asset } = await savedAndReloaded();
    const result = await relinkModel(asset, glbFile('other.glb', [5, 5, 5]));
    expect(result.status).toBe('mismatch');
    expect(isModelReady(asset)).toBe(false);

    if (result.status !== 'mismatch') throw new Error('expected a mismatch');
    acceptRelink(asset.id, result.file);
    const relinked = useProjectStore.getState().models[asset.id];
    expect(relinked.sha256).not.toBe(asset.sha256);
    expect(relinked.fileName).toBe('other.glb');
    expect(relinked.bounds.max).toEqual([5, 5, 5]);
    expect(isModelReady(relinked)).toBe(true);
  });

  it('refuses a relink file that is not a model', async () => {
    const { asset } = await savedAndReloaded();
    await expect(relinkModel(asset, new File(['x'], 'x.png'))).rejects.toBeInstanceOf(ModelFileError);
  });
});

describe('releasing model bytes', () => {
  it('keeps bytes that undo or redo can still reach, and frees the rest', async () => {
    const stop = installModelRetention();
    try {
      const item = await importModel(glbFile('tower.glb'), { position: [0, 0], startTime: 0 });
      const { sha256 } = useProjectStore.getState().models[item.assetId];
      const { url } = getLoadedModel(sha256)!;

      useProjectStore.getState().removeItem(item.id);
      await Promise.resolve();
      // Undo can bring it back, so the bytes stay.
      expect(modelHashesInUse().has(sha256)).toBe(true);
      expect(getLoadedModel(sha256)).toBeDefined();

      // A new project leaves nothing that can reach it.
      useProjectStore.getState().loadFullProject(createProject());
      expect(getLoadedModel(sha256)).toBeUndefined();
      expect(revokeObjectURL).toHaveBeenCalledWith(url);
    } finally {
      stop();
    }
  });

  it('frees nothing that the project still uses', async () => {
    const stop = installModelRetention();
    try {
      const item = await importModel(glbFile('tower.glb'), { position: [0, 0], startTime: 0 });
      useProjectStore.getState().updateItem(item.id, { heading: 45 } as Partial<ModelItem>);
      undo();
      expect(Object.keys(useModelRegistry.getState().loaded)).toHaveLength(1);
    } finally {
      stop();
    }
  });
});

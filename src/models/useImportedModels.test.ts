import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { CAMERA_TRACK_ID, createProject } from '@/store/projectDocument';
import { createModelItem } from '@/store/itemFactories';
import type { ModelAsset } from '@/store/types';
import { clearModelRegistry, markModelFailed, registerModelBytes } from './modelRegistry';
import { useImportedModels } from './useImportedModels';
import { MODEL_TERMS } from './modelTerms';
import { isModelReady } from './modelRegistry';
import { sha256Hex } from './glb';
import { makeGlb } from './testGlb';

const toast = vi.hoisted(() => ({ warning: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const asset: ModelAsset = { id: 'a1', fileName: 'tower.glb', byteSize: 1, sha256: '1'.repeat(64), bounds: { min: [0, 0, 0], max: [1, 1, 1] } };

beforeEach(() => {
  clearModelRegistry();
  toast.warning.mockClear();
  toast.error.mockClear();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:m'), revokeObjectURL: vi.fn() }));
  useProjectStore.setState({ ...createProject(), ...createTransientState() });
});

describe('useImportedModels', () => {
  it('says when an opened project has models whose files are missing, and Show selects one', () => {
    const { unmount } = renderHook(() => useImportedModels());
    const item = { ...createModelItem({ assetId: 'a1', name: 'Tower', position: [0, 0], startTime: 0 }), id: 'm1' };
    useProjectStore.getState().loadFullProject({
      ...createProject({ id: 'other' }),
      schemaVersion: 5,
      models: { a1: asset },
      items: { [CAMERA_TRACK_ID]: { kind: 'camera', id: CAMERA_TRACK_ID, keyframes: [] }, m1: item },
      itemOrder: [CAMERA_TRACK_ID, 'm1'],
    });
    expect(toast.warning).toHaveBeenCalledWith(MODEL_TERMS.missingOnLoad(1), expect.anything());
    const [, options] = toast.warning.mock.calls[0];
    options.action.onClick();
    expect(useProjectStore.getState().selectedItemId).toBe('m1');
    unmount();
  });

  it('says nothing for a project without models', () => {
    const { unmount } = renderHook(() => useImportedModels());
    useProjectStore.getState().loadFullProject(createProject({ id: 'plain' }));
    expect(toast.warning).not.toHaveBeenCalled();
    unmount();
  });

  it('says when the map could not load a model file, once, and Show selects an item using it', () => {
    const { unmount } = renderHook(() => useImportedModels());
    const item = { ...createModelItem({ assetId: 'a1', name: 'Tower', position: [0, 0], startTime: 0 }), id: 'm1' };
    useProjectStore.setState({ models: { a1: asset }, items: { m1: item }, itemOrder: ['m1'] });
    registerModelBytes(asset.sha256, new ArrayBuffer(4));
    expect(toast.error).not.toHaveBeenCalled();

    markModelFailed(asset.sha256);
    markModelFailed(asset.sha256);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(MODEL_TERMS.loadFailed('tower.glb'), expect.anything());
    const [, options] = toast.error.mock.calls[0];
    options.action.onClick();
    expect(useProjectStore.getState().selectedItemId).toBe('m1');
    unmount();
  });

  describe('models loaded from a link', () => {
    const fetchMock = vi.fn();
    const bytes = makeGlb({ nodes: [{ mesh: 0 }], min: [0, 0, 0], max: [1, 1, 1] });
    const openWith = async (...assets: ModelAsset[]) => {
      const items: Record<string, ReturnType<typeof createModelItem>> = {};
      for (const a of assets) items[`m-${a.id}`] = { ...createModelItem({ assetId: a.id, name: a.fileName, position: [0, 0], startTime: 0 }), id: `m-${a.id}` };
      useProjectStore.getState().loadFullProject({
        ...createProject({ id: 'other' }),
        schemaVersion: 5,
        models: Object.fromEntries(assets.map((a) => [a.id, a])),
        items: { [CAMERA_TRACK_ID]: { kind: 'camera', id: CAMERA_TRACK_ID, keyframes: [] }, ...items },
        itemOrder: [CAMERA_TRACK_ID, ...Object.keys(items)],
      });
    };
    const linked = async (id: string): Promise<ModelAsset> =>
      ({ ...asset, id, byteSize: bytes.byteLength, sha256: await sha256Hex(bytes), sourceUrl: `https://cdn.test/${id}.glb` });

    beforeEach(() => {
      vi.stubGlobal('fetch', fetchMock);
      fetchMock.mockReset();
    });

    it('fetches them again on open and checks the hash, so nothing needs a relink', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(new Response(bytes.slice(0))));
      const { unmount } = renderHook(() => useImportedModels());
      const a = await linked('a1');
      await openWith(a);
      await waitFor(() => expect(isModelReady(a)).toBe(true));
      expect(fetchMock).toHaveBeenCalledWith('https://cdn.test/a1.glb');
      expect(toast.warning).not.toHaveBeenCalled();
      unmount();
    });

    it('still asks for the files that could not be fetched, and only those', async () => {
      fetchMock.mockImplementation((url: string) =>
        Promise.resolve(url.includes('good') ? new Response(bytes.slice(0)) : new Response('gone', { status: 404 })));
      const { unmount } = renderHook(() => useImportedModels());
      // A different file than the good one, so the good download cannot stand in for it.
      await openWith(await linked('good'), { ...(await linked('bad')), sha256: '2'.repeat(64) }, { ...asset, id: 'plain' });
      await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(MODEL_TERMS.missingOnLoad(2), expect.anything()));
      unmount();
    });

    it('asks for a file whose link now gives a different model', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(new Response(makeGlb({ nodes: [{ mesh: 0 }], min: [0, 0, 0], max: [7, 7, 7] }))));
      const { unmount } = renderHook(() => useImportedModels());
      const a = await linked('a1');
      await openWith(a);
      await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(MODEL_TERMS.missingOnLoad(1), expect.anything()));
      expect(isModelReady(a)).toBe(false);
      unmount();
    });
  });
});

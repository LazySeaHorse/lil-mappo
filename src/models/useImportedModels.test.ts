import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { CAMERA_TRACK_ID, createProject } from '@/store/projectDocument';
import { createModelItem } from '@/store/itemFactories';
import type { ModelAsset } from '@/store/types';
import { clearModelRegistry, markModelFailed, registerModelBytes } from './modelRegistry';
import { useImportedModels } from './useImportedModels';
import { MODEL_TERMS } from './modelTerms';

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
});

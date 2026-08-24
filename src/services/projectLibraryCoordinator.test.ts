import { describe, expect, it, vi } from 'vitest';
import type { Project } from '@/store/types';

vi.mock('./projectLibrary', () => ({
  beginProjectDeletion: vi.fn(),
  finalizeProjectDeletion: vi.fn(),
  listProjectDeletions: vi.fn().mockResolvedValue([]),
  listSavedProjects: vi.fn().mockResolvedValue([]),
  loadProjectFromLibrary: vi.fn(),
  markProjectDeletionCloudComplete: vi.fn(),
  saveProjectToLibrary: vi.fn(),
  updateCloudSyncMeta: vi.fn(),
}));

vi.mock('./cloudProjectLibrary', () => ({
  deleteProjectFromCloud: vi.fn(),
  listCloudProjects: vi.fn().mockResolvedValue([]),
  loadProjectFromCloud: vi.fn(),
  saveProjectToCloud: vi.fn(),
}));

import {
  mergeLibraryProjects,
  ProjectLibraryCoordinator,
  type ProjectLibraryAdapters,
} from './projectLibraryCoordinator';

const project = { id: 'local-1', name: 'Local project' } as Project;
const localInfo = {
  id: project.id,
  name: project.name,
  updatedAt: 100,
  cloudSyncedAt: null,
  pendingSync: false,
};

function createAdapters(overrides: Partial<ProjectLibraryAdapters> = {}): ProjectLibraryAdapters {
  return {
    listLocal: vi.fn().mockResolvedValue([localInfo]),
    loadLocal: vi.fn().mockResolvedValue(project),
    saveLocal: vi.fn().mockImplementation(async (value: Project, options = {}) => ({
      id: value.id,
      name: value.name,
      updatedAt: options.updatedAt ?? 100,
      cloudSyncedAt: options.cloudSyncedAt ?? null,
      pendingSync: options.pendingSync ?? false,
    })),
    updateLocalMeta: vi.fn().mockResolvedValue(undefined),
    listCloud: vi.fn().mockResolvedValue([]),
    loadCloud: vi.fn().mockResolvedValue(project),
    saveCloud: vi.fn().mockImplementation(async (_value, updatedAt = 100) => ({ updatedAt })),
    deleteCloud: vi.fn().mockResolvedValue(undefined),
    beginDeletion: vi.fn().mockResolvedValue(undefined),
    markDeletionCloudComplete: vi.fn().mockResolvedValue(undefined),
    finalizeDeletion: vi.fn().mockResolvedValue(undefined),
    listDeletions: vi.fn().mockResolvedValue([]),
    now: vi.fn(() => 100),
    ...overrides,
  };
}

describe('ProjectLibraryCoordinator', () => {
  it('uses actual cloud presence even when local sync metadata is stale', () => {
    const merged = mergeLibraryProjects(
      [localInfo],
      [{ id: project.id, name: project.name, updatedAt: 100 }]
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].cloud).not.toBeNull();
    expect(merged[0].syncState).toBe('synced');
  });

  it('repairs stale metadata when local and cloud timestamps prove the upload matches', async () => {
    const adapters = createAdapters({
      listLocal: vi.fn().mockResolvedValue([{ ...localInfo, pendingSync: true }]),
      listCloud: vi.fn().mockResolvedValue([{
        id: project.id,
        name: project.name,
        updatedAt: localInfo.updatedAt,
      }]),
    });
    const coordinator = new ProjectLibraryCoordinator(adapters);

    const projects = await coordinator.listProjects(true);

    expect(adapters.updateLocalMeta).toHaveBeenCalledWith(project.id, {
      cloudSyncedAt: localInfo.updatedAt,
      pendingSync: false,
    });
    expect(projects[0].syncState).toBe('synced');
  });

  it('preserves a pending local save when the cloud write fails', async () => {
    const cloudError = new Error('offline');
    const adapters = createAdapters({ saveCloud: vi.fn().mockRejectedValue(cloudError) });
    const coordinator = new ProjectLibraryCoordinator(adapters);

    const result = await coordinator.saveProject(project, true);

    expect(result).toEqual({ status: 'cloud-failed', localPreserved: true, error: cloudError });
    expect(adapters.saveLocal).toHaveBeenCalledWith(project, {
      updatedAt: 100,
      pendingSync: true,
    });
  });

  it('reports a committed upload separately from failed local metadata repair', async () => {
    const metadataError = new Error('indexeddb unavailable');
    const adapters = createAdapters({
      updateLocalMeta: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(metadataError),
    });
    const coordinator = new ProjectLibraryCoordinator(adapters);

    const result = await coordinator.uploadLocalProject(project.id, localInfo.updatedAt);

    expect(result).toEqual({
      status: 'metadata-repair-needed',
      cloudCommitted: true,
      syncedAt: 100,
      error: metadataError,
    });
    expect(adapters.saveCloud).toHaveBeenCalledWith(project, 100);
  });

  it('does not upload or remove a local project when slot eviction fails', async () => {
    const cloudError = new Error('delete failed');
    const adapters = createAdapters({ deleteCloud: vi.fn().mockRejectedValue(cloudError) });
    const coordinator = new ProjectLibraryCoordinator(adapters);

    const result = await coordinator.replaceCloudProject('old-cloud', project.id);

    expect(result.removal).toEqual({
      status: 'cloud-failed',
      localPreserved: true,
      error: cloudError,
    });
    expect(result.upload).toBeUndefined();
    expect(adapters.saveCloud).not.toHaveBeenCalled();
    expect(adapters.beginDeletion).not.toHaveBeenCalled();
    expect(adapters.finalizeDeletion).not.toHaveBeenCalled();
  });

  it('evicts only the cloud copy before uploading the replacement', async () => {
    const calls: string[] = [];
    const adapters = createAdapters({
      deleteCloud: vi.fn().mockImplementation(async () => { calls.push('delete-cloud'); }),
      updateLocalMeta: vi.fn().mockImplementation(async (id) => { calls.push(`meta:${id}`); }),
      saveCloud: vi.fn().mockImplementation(async () => {
        calls.push('save-cloud');
        return { updatedAt: 100 };
      }),
    });
    const coordinator = new ProjectLibraryCoordinator(adapters);

    const result = await coordinator.replaceCloudProject('old-cloud', project.id);

    expect(result.upload?.status).toBe('uploaded');
    expect(calls).toEqual([
      'delete-cloud',
      'meta:old-cloud',
      `meta:${project.id}`,
      'save-cloud',
      `meta:${project.id}`,
    ]);
    expect(adapters.beginDeletion).not.toHaveBeenCalled();
    expect(adapters.finalizeDeletion).not.toHaveBeenCalled();
  });

  it('persists deletion intent before the cloud delete and keeps it on failure', async () => {
    const calls: string[] = [];
    const cloudError = new Error('offline');
    const adapters = createAdapters({
      beginDeletion: vi.fn().mockImplementation(async () => { calls.push('tombstone'); }),
      deleteCloud: vi.fn().mockImplementation(async () => {
        calls.push('delete-cloud');
        throw cloudError;
      }),
      finalizeDeletion: vi.fn().mockImplementation(async () => { calls.push('finalize'); }),
    });
    const coordinator = new ProjectLibraryCoordinator(adapters);

    const result = await coordinator.deleteProjectEverywhere(project.id, true);

    expect(result).toEqual({ status: 'pending-retry', localPreserved: true, error: cloudError });
    expect(calls).toEqual(['tombstone', 'delete-cloud']);
  });

  it('retries tombstoned deletes idempotently and then finalizes locally', async () => {
    const calls: string[] = [];
    const adapters = createAdapters({
      listDeletions: vi.fn().mockResolvedValue([{ id: project.id, createdAt: 1, cloudPending: true }]),
      deleteCloud: vi.fn().mockImplementation(async () => { calls.push('delete-cloud'); }),
      markDeletionCloudComplete: vi.fn().mockImplementation(async () => { calls.push('cloud-complete'); }),
      finalizeDeletion: vi.fn().mockImplementation(async () => { calls.push('finalize'); }),
    });
    const coordinator = new ProjectLibraryCoordinator(adapters);

    await coordinator.retryPendingDeletions();

    expect(calls).toEqual(['delete-cloud', 'cloud-complete', 'finalize']);
  });

  it('finalizes a remotely-completed tombstone without requiring cloud access', async () => {
    const adapters = createAdapters({
      listDeletions: vi.fn().mockResolvedValue([{
        id: project.id,
        createdAt: 1,
        cloudPending: false,
      }]),
    });
    const coordinator = new ProjectLibraryCoordinator(adapters);

    const errors = await coordinator.retryPendingDeletions(false);

    expect(errors).toEqual([]);
    expect(adapters.deleteCloud).not.toHaveBeenCalled();
    expect(adapters.finalizeDeletion).toHaveBeenCalledWith(project.id);
  });

  it('preserves the cloud timestamp when downloading', async () => {
    const adapters = createAdapters();
    const coordinator = new ProjectLibraryCoordinator(adapters);
    const cloud = { id: project.id, name: project.name, updatedAt: 456 };

    await coordinator.downloadCloudProject(cloud);

    expect(adapters.saveLocal).toHaveBeenCalledWith(project, {
      updatedAt: 456,
      cloudSyncedAt: 456,
      pendingSync: false,
    });
  });
});

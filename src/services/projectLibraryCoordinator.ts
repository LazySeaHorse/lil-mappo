import type { Project } from '@/store/types';
import {
  beginProjectDeletion,
  finalizeProjectDeletion,
  listProjectDeletions,
  listSavedProjects,
  loadProjectFromLibrary,
  markProjectDeletionCloudComplete,
  saveProjectToLibrary,
  updateCloudSyncMeta,
  type ProjectDeletion,
  type SavedProjectInfo,
  type SaveProjectOptions,
} from './projectLibrary';
import {
  deleteProjectFromCloud,
  listCloudProjects,
  loadProjectFromCloud,
  saveProjectToCloud,
  type CloudProjectInfo,
} from './cloudProjectLibrary';

export interface LibraryProject {
  id: string;
  name: string;
  updatedAt: number;
  local: SavedProjectInfo | null;
  cloud: CloudProjectInfo | null;
  syncState: 'local-only' | 'cloud-only' | 'synced' | 'pending-upload' | 'conflicted';
}

export type CloudWriteResult =
  | { status: 'uploaded'; syncedAt: number }
  | { status: 'cloud-failed'; localPreserved: true; error: unknown }
  | { status: 'metadata-repair-needed'; cloudCommitted: true; syncedAt: number; error: unknown }
  | { status: 'local-failed'; error: unknown };

export type SaveResult =
  | { status: 'saved-locally'; saved: SavedProjectInfo }
  | CloudWriteResult;

export type RemoveCloudCopyResult =
  | { status: 'removed' }
  | { status: 'metadata-repair-needed'; cloudCommitted: true; error: unknown }
  | { status: 'cloud-failed'; localPreserved: true; error: unknown };

export type DeleteResult =
  | { status: 'deleted' }
  | { status: 'pending-retry'; localPreserved: true; error: unknown }
  | { status: 'local-failed'; error: unknown };

export interface ProjectLibraryAdapters {
  listLocal(): Promise<SavedProjectInfo[]>;
  loadLocal(id: string): Promise<Project>;
  saveLocal(project: Project, options?: SaveProjectOptions): Promise<SavedProjectInfo>;
  updateLocalMeta(id: string, meta: { cloudSyncedAt?: number | null; pendingSync?: boolean }): Promise<void>;
  listCloud(): Promise<CloudProjectInfo[]>;
  loadCloud(id: string): Promise<Project>;
  saveCloud(project: Project, updatedAt?: number): Promise<{ updatedAt: number }>;
  deleteCloud(id: string): Promise<void>;
  beginDeletion(id: string, cloudPending: boolean): Promise<void>;
  markDeletionCloudComplete(id: string): Promise<void>;
  finalizeDeletion(id: string): Promise<void>;
  listDeletions(): Promise<ProjectDeletion[]>;
  now(): number;
}

const defaultAdapters: ProjectLibraryAdapters = {
  listLocal: listSavedProjects,
  loadLocal: loadProjectFromLibrary,
  saveLocal: saveProjectToLibrary,
  updateLocalMeta: updateCloudSyncMeta,
  listCloud: listCloudProjects,
  loadCloud: loadProjectFromCloud,
  saveCloud: saveProjectToCloud,
  deleteCloud: deleteProjectFromCloud,
  beginDeletion: beginProjectDeletion,
  markDeletionCloudComplete: markProjectDeletionCloudComplete,
  finalizeDeletion: finalizeProjectDeletion,
  listDeletions: listProjectDeletions,
  now: Date.now,
};

export function mergeLibraryProjects(
  localProjects: SavedProjectInfo[],
  cloudProjects: CloudProjectInfo[],
  deletionIds: ReadonlySet<string> = new Set()
): LibraryProject[] {
  const localById = new Map(localProjects.map((project) => [project.id, project]));
  const cloudById = new Map(cloudProjects.map((project) => [project.id, project]));
  const ids = new Set([...localById.keys(), ...cloudById.keys()]);
  const result: LibraryProject[] = [];

  for (const id of ids) {
    if (deletionIds.has(id)) continue;
    const local = localById.get(id) ?? null;
    const cloud = cloudById.get(id) ?? null;
    const updatedAt = Math.max(local?.updatedAt ?? 0, cloud?.updatedAt ?? 0);
    let syncState: LibraryProject['syncState'];

    if (!local) syncState = 'cloud-only';
    else if (!cloud) syncState = local.pendingSync ? 'pending-upload' : 'local-only';
    else if (local.pendingSync) syncState = 'pending-upload';
    else if (local.updatedAt === cloud.updatedAt) syncState = 'synced';
    else syncState = 'conflicted';

    result.push({
      id,
      name: local?.name ?? cloud?.name ?? 'Untitled Project',
      updatedAt,
      local,
      cloud,
      syncState,
    });
  }

  return result.sort((a, b) => b.updatedAt - a.updatedAt);
}

export class ProjectLibraryCoordinator {
  constructor(private readonly adapters: ProjectLibraryAdapters = defaultAdapters) {}

  async listProjects(includeCloud: boolean): Promise<LibraryProject[]> {
    await this.retryPendingDeletions(includeCloud);
    const [localProjects, cloud, deletions] = await Promise.all([
      this.adapters.listLocal(),
      includeCloud ? this.adapters.listCloud() : Promise.resolve([]),
      this.adapters.listDeletions(),
    ]);

    // Repair the local half of an upload that committed remotely before its
    // metadata update completed. Equal timestamps prove the payload versions match.
    const cloudById = new Map(cloud.map((project) => [project.id, project]));
    const local = await Promise.all(localProjects.map(async (project) => {
      const cloudProject = cloudById.get(project.id);
      const needsRepair = cloudProject
        && cloudProject.updatedAt === project.updatedAt
        && (project.pendingSync || project.cloudSyncedAt !== cloudProject.updatedAt);
      if (!needsRepair) return project;

      try {
        await this.adapters.updateLocalMeta(project.id, {
          cloudSyncedAt: cloudProject.updatedAt,
          pendingSync: false,
        });
        return {
          ...project,
          cloudSyncedAt: cloudProject.updatedAt,
          pendingSync: false,
        };
      } catch {
        return project;
      }
    }));

    return mergeLibraryProjects(local, cloud, new Set(deletions.map(({ id }) => id)));
  }

  async saveProject(project: Project, uploadToCloud: boolean): Promise<SaveResult> {
    const updatedAt = this.adapters.now();
    let saved: SavedProjectInfo;
    try {
      saved = await this.adapters.saveLocal(project, {
        updatedAt,
        pendingSync: uploadToCloud,
      });
    } catch (error) {
      return { status: 'local-failed', error };
    }

    if (!uploadToCloud) return { status: 'saved-locally', saved };
    return this.uploadLoadedProject(project, saved.updatedAt);
  }

  async uploadLocalProject(id: string, updatedAt?: number): Promise<CloudWriteResult> {
    try {
      const [project, localProjects] = await Promise.all([
        this.adapters.loadLocal(id),
        updatedAt === undefined ? this.adapters.listLocal() : Promise.resolve([]),
      ]);
      const localUpdatedAt = updatedAt ?? localProjects.find((item) => item.id === id)?.updatedAt;
      if (localUpdatedAt === undefined) throw new Error('Project metadata not found');
      await this.adapters.updateLocalMeta(id, { pendingSync: true });
      return this.uploadLoadedProject(project, localUpdatedAt);
    } catch (error) {
      return { status: 'local-failed', error };
    }
  }

  private async uploadLoadedProject(project: Project, updatedAt: number): Promise<CloudWriteResult> {
    let cloudResult: { updatedAt: number };
    try {
      cloudResult = await this.adapters.saveCloud(project, updatedAt);
    } catch (error) {
      return { status: 'cloud-failed', localPreserved: true, error };
    }

    try {
      await this.adapters.updateLocalMeta(project.id, {
        cloudSyncedAt: cloudResult.updatedAt,
        pendingSync: false,
      });
      return { status: 'uploaded', syncedAt: cloudResult.updatedAt };
    } catch (error) {
      return {
        status: 'metadata-repair-needed',
        cloudCommitted: true,
        syncedAt: cloudResult.updatedAt,
        error,
      };
    }
  }

  async downloadCloudProject(project: CloudProjectInfo): Promise<Project> {
    const full = await this.adapters.loadCloud(project.id);
    await this.adapters.saveLocal(full, {
      updatedAt: project.updatedAt,
      cloudSyncedAt: project.updatedAt,
      pendingSync: false,
    });
    return full;
  }

  async removeCloudCopy(id: string): Promise<RemoveCloudCopyResult> {
    try {
      await this.adapters.deleteCloud(id);
    } catch (error) {
      return { status: 'cloud-failed', localPreserved: true, error };
    }

    try {
      await this.adapters.updateLocalMeta(id, { cloudSyncedAt: null, pendingSync: false });
      return { status: 'removed' };
    } catch (error) {
      return { status: 'metadata-repair-needed', cloudCommitted: true, error };
    }
  }

  async replaceCloudProject(removeCloudId: string, uploadLocalId: string): Promise<{
    removal: RemoveCloudCopyResult;
    upload?: CloudWriteResult;
  }> {
    const removal = await this.removeCloudCopy(removeCloudId);
    if (removal.status === 'cloud-failed') return { removal };
    return { removal, upload: await this.uploadLocalProject(uploadLocalId) };
  }

  async deleteProjectEverywhere(id: string, hasCloudCopy: boolean): Promise<DeleteResult> {
    try {
      await this.adapters.beginDeletion(id, hasCloudCopy);
    } catch (error) {
      return { status: 'local-failed', error };
    }

    if (hasCloudCopy) {
      try {
        await this.adapters.deleteCloud(id);
        await this.adapters.markDeletionCloudComplete(id);
      } catch (error) {
        return { status: 'pending-retry', localPreserved: true, error };
      }
    }

    try {
      await this.adapters.finalizeDeletion(id);
      return { status: 'deleted' };
    } catch (error) {
      return { status: 'pending-retry', localPreserved: true, error };
    }
  }

  async retryPendingDeletions(canUseCloud = true): Promise<unknown[]> {
    const deletions = await this.adapters.listDeletions();
    const errors: unknown[] = [];
    for (const deletion of deletions) {
      if (deletion.cloudPending && !canUseCloud) continue;
      try {
        if (deletion.cloudPending) {
          await this.adapters.deleteCloud(deletion.id);
          await this.adapters.markDeletionCloudComplete(deletion.id);
        }
        await this.adapters.finalizeDeletion(deletion.id);
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }
}

export const projectLibraryCoordinator = new ProjectLibraryCoordinator();

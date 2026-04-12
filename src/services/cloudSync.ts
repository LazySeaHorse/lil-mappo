import {
  listCloudProjects,
  loadProjectFromCloud,
  saveProjectToCloud,
} from './cloudProjectLibrary';
import {
  listSavedProjects,
  loadProjectFromLibrary,
  saveProjectToLibrary,
  updateCloudSyncMeta,
} from './projectLibrary';

export interface SyncResult {
  /** True if the sync was aborted due to a network / connectivity error. */
  offline: boolean;
  /** Number of local projects pushed to cloud. */
  uploaded: number;
  /** Number of cloud projects downloaded to local. */
  downloaded: number;
}

/**
 * Merges local (IndexedDB) and cloud (Supabase) project libraries.
 *
 * Download direction  — cloud → local:
 *   A cloud project is downloaded when it doesn't exist locally, or when the
 *   cloud's updated_at is newer than the local cloudSyncedAt (meaning the cloud
 *   copy changed on another device since our last sync).
 *
 * Upload direction  — local → cloud:
 *   Only attempted when canSave is true.
 *   A local project is uploaded when pendingSync is true, or when updatedAt is
 *   newer than cloudSyncedAt (local edits not yet pushed).
 *
 * Conflict rule: whichever copy has the newer timestamp wins.
 */
export async function syncProjects(canSave: boolean): Promise<SyncResult> {
  try {
    const [cloudList, localList] = await Promise.all([
      listCloudProjects(),
      listSavedProjects(),
    ]);

    const localById = new Map(localList.map((p) => [p.id, p]));
    const cloudById = new Map(cloudList.map((p) => [p.id, p]));

    let uploaded = 0;
    let downloaded = 0;

    // ── Download: cloud → local ─────────────────────────────────────────────
    for (const cloudProject of cloudList) {
      const local = localById.get(cloudProject.id);

      const needsDownload =
        !local ||
        // Cloud is newer than the last time we synced this project
        cloudProject.updatedAt > (local.cloudSyncedAt ?? 0);

      // But don't download if local has unsaved changes that are newer
      const localIsNewer =
        local && local.updatedAt > cloudProject.updatedAt;

      if (needsDownload && !localIsNewer) {
        const full = await loadProjectFromCloud(cloudProject.id);
        await saveProjectToLibrary(full, {
          cloudSyncedAt: cloudProject.updatedAt,
          pendingSync: false,
        });
        downloaded++;
      }
    }

    // ── Upload: local → cloud ───────────────────────────────────────────────
    if (canSave) {
      for (const localProject of localList) {
        const needsUpload =
          localProject.pendingSync ||
          // Local has changes newer than the last cloud push
          localProject.updatedAt > (localProject.cloudSyncedAt ?? 0);

        if (!needsUpload) continue;

        // Don't overwrite a cloud copy that's actually newer
        const cloudProject = cloudById.get(localProject.id);
        if (cloudProject && cloudProject.updatedAt > localProject.updatedAt) continue;

        const full = await loadProjectFromLibrary(localProject.id);
        await saveProjectToCloud(full);
        await updateCloudSyncMeta(localProject.id, {
          cloudSyncedAt: localProject.updatedAt,
          pendingSync: false,
        });
        uploaded++;
      }
    }

    return { offline: false, uploaded, downloaded };
  } catch (err) {
    if (isNetworkError(err)) {
      return { offline: true, uploaded: 0, downloaded: 0 };
    }
    throw err;
  }
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('network') || msg.includes('offline') || msg.includes('failed to fetch')) {
      return true;
    }
  }
  return false;
}

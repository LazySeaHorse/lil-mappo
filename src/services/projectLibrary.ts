import { Project } from '@/store/types';

const DB_NAME = 'LilMapLibraryDB';
const STORE_NAME = 'projects';
const DELETION_STORE_NAME = 'project_deletions';
const DB_VERSION = 2;

export interface SavedProjectInfo {
  id: string;
  name: string;
  updatedAt: number;
  /** Unix ms timestamp of the last successful cloud push, or null if never synced. */
  cloudSyncedAt: number | null;
  /** True when local changes haven't been pushed to cloud yet. */
  pendingSync: boolean;
}

export interface ProjectDeletion {
  id: string;
  createdAt: number;
  /** False once the remote delete has committed (or no cloud copy existed). */
  cloudPending: boolean;
}

export interface SaveProjectOptions {
  cloudSyncedAt?: number | null;
  pendingSync?: boolean;
  /** Preserve a timestamp shared with the cloud write or download. */
  updatedAt?: number;
}

/** Shape of a record as stored in IndexedDB (project data + library metadata). */
interface StoredRecord extends Project {
  updatedAt: number;
  cloudSyncedAt: number | null;
  pendingSync: boolean;
}

// Internal helper to get DB connection
function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open database'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(DELETION_STORE_NAME)) {
        db.createObjectStore(DELETION_STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

/** Reads the raw stored record for a project (including library metadata). */
async function getStoredRecord(db: IDBDatabase, id: string): Promise<StoredRecord | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(new Error('Failed to read record'));
  });
}

/**
 * Saves a full project to the IndexedDB library.
 *
 * Preserves existing cloudSyncedAt from the stored record unless
 * syncMeta.cloudSyncedAt is explicitly provided.
 * Stamps a fresh updatedAt unless the caller supplies a timestamp shared with
 * a cloud operation.
 */
export async function saveProjectToLibrary(
  project: Project,
  syncMeta?: SaveProjectOptions
): Promise<SavedProjectInfo> {
  const db = await getDB();
  const existing = await getStoredRecord(db, project.id);

  const projectToSave: StoredRecord = {
    ...project,
    updatedAt: syncMeta?.updatedAt ?? Date.now(),
    cloudSyncedAt:
      syncMeta?.cloudSyncedAt !== undefined
        ? syncMeta.cloudSyncedAt
        : (existing?.cloudSyncedAt ?? null),
    pendingSync:
      syncMeta?.pendingSync !== undefined
        ? syncMeta.pendingSync
        : (existing?.pendingSync ?? false),
  };

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(projectToSave);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to save project'));
  });

  return {
    id: projectToSave.id,
    name: projectToSave.name,
    updatedAt: projectToSave.updatedAt,
    cloudSyncedAt: projectToSave.cloudSyncedAt,
    pendingSync: projectToSave.pendingSync,
  };
}

/**
 * Patches only the cloud sync metadata fields of a stored project.
 * Used after a successful cloud push or to mark a project as pending sync.
 */
export async function updateCloudSyncMeta(
  id: string,
  meta: { cloudSyncedAt?: number | null; pendingSync?: boolean }
): Promise<void> {
  const db = await getDB();
  const existing = await getStoredRecord(db, id);
  if (!existing) return; // project not in local library — nothing to update

  const updated: StoredRecord = {
    ...existing,
    ...(meta.cloudSyncedAt !== undefined && { cloudSyncedAt: meta.cloudSyncedAt }),
    ...(meta.pendingSync !== undefined && { pendingSync: meta.pendingSync }),
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(updated);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to update sync meta'));
  });
}

/**
 * Retrieves list of all saved projects metadata (without the heavy timeline items).
 */
export async function listSavedProjects(): Promise<SavedProjectInfo[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const allProjects: StoredRecord[] = request.result || [];
      const infos: SavedProjectInfo[] = allProjects.map((p) => ({
        id: p.id,
        name: p.name,
        updatedAt: p.updatedAt || Date.now(),
        cloudSyncedAt: p.cloudSyncedAt ?? null,
        pendingSync: p.pendingSync ?? false,
      }));
      resolve(infos.sort((a, b) => b.updatedAt - a.updatedAt));
    };
    request.onerror = () => reject(new Error('Failed to list projects'));
  });
}

/**
 * Loads a full project by its ID.
 * Strips library-only fields (updatedAt, cloudSyncedAt, pendingSync) before
 * returning so they don't bleed into the store's Project type.
 */
export async function loadProjectFromLibrary(id: string): Promise<Project> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      if (request.result) {
        const { updatedAt, cloudSyncedAt, pendingSync, ...projectState } = request.result;
        resolve(projectState as Project);
      } else {
        reject(new Error('Project not found'));
      }
    };
    request.onerror = () => reject(new Error('Failed to load project'));
  });
}

/**
 * Deletes a project from the library by its ID.
 */
export async function deleteProjectFromLibrary(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to delete project'));
  });
}

/** Persist deletion intent before touching either storage backend. */
export async function beginProjectDeletion(id: string, cloudPending: boolean): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DELETION_STORE_NAME, 'readwrite');
    const request = transaction.objectStore(DELETION_STORE_NAME).put({
      id,
      createdAt: Date.now(),
      cloudPending,
    });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to record project deletion'));
  });
}

/** Record that the remote half committed before finalizing the local transaction. */
export async function markProjectDeletionCloudComplete(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DELETION_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(DELETION_STORE_NAME);
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const existing = getRequest.result as ProjectDeletion | undefined;
      if (!existing) return;
      store.put({ ...existing, cloudPending: false });
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to update project deletion'));
    transaction.onabort = () => reject(new Error('Failed to update project deletion'));
  });
}

/**
 * Delete the local project and its completed outbox entry atomically. If this
 * transaction fails, the tombstone remains and the operation can be retried.
 */
export async function finalizeProjectDeletion(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, DELETION_STORE_NAME], 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.objectStore(DELETION_STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to finalize project deletion'));
    transaction.onabort = () => reject(new Error('Failed to finalize project deletion'));
  });
}

export async function listProjectDeletions(): Promise<ProjectDeletion[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(DELETION_STORE_NAME, 'readonly')
      .objectStore(DELETION_STORE_NAME)
      .getAll();
    request.onsuccess = () => resolve((request.result ?? []).map((deletion) => ({
      ...deletion,
      // Treat an interrupted record without a stage as requiring the safe remote retry.
      cloudPending: deletion.cloudPending ?? true,
    })));
    request.onerror = () => reject(new Error('Failed to list project deletions'));
  });
}

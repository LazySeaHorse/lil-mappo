import { Project } from '@/store/types';

const DB_NAME = 'LilMapLibraryDB';
const STORE_NAME = 'projects';
const DB_VERSION = 1;

export interface SavedProjectInfo {
  id: string;
  name: string;
  updatedAt: number;
  /** Unix ms timestamp of the last successful cloud push, or null if never synced. */
  cloudSyncedAt: number | null;
  /** True when local changes haven't been pushed to cloud yet. */
  pendingSync: boolean;
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
 * Always stamps a fresh updatedAt.
 */
export async function saveProjectToLibrary(
  project: Project,
  syncMeta?: { cloudSyncedAt?: number | null; pendingSync?: boolean }
): Promise<void> {
  const db = await getDB();
  const existing = await getStoredRecord(db, project.id);

  const projectToSave: StoredRecord = {
    ...project,
    updatedAt: Date.now(),
    cloudSyncedAt:
      syncMeta?.cloudSyncedAt !== undefined
        ? syncMeta.cloudSyncedAt
        : (existing?.cloudSyncedAt ?? null),
    pendingSync:
      syncMeta?.pendingSync !== undefined
        ? syncMeta.pendingSync
        : (existing?.pendingSync ?? false),
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(projectToSave);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to save project'));
  });
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

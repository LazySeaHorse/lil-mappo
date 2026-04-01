import { Project } from '@/store/types';

const DB_NAME = 'LilMapLibraryDB';
const STORE_NAME = 'projects';
const DB_VERSION = 1;

export interface SavedProjectInfo {
  id: string;
  name: string;
  updatedAt: number;
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
        // We use the project ID as the key
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Saves a full project to the IndexedDB library.
 */
export async function saveProjectToLibrary(project: Project): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // Attach an updatedAt timestamp so we know when it was saved
    const projectToSave = {
      ...project,
      updatedAt: Date.now()
    };

    const request = store.put(projectToSave);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to save project'));
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
      const allProjects = request.result || [];
      // Map it down to just the info we want so we're not passing huge objects to UI
      const infos: SavedProjectInfo[] = allProjects.map(p => ({
        id: p.id,
        name: p.name,
        updatedAt: p.updatedAt || Date.now()
      }));
      // Sort newest first
      resolve(infos.sort((a, b) => b.updatedAt - a.updatedAt));
    };
    request.onerror = () => reject(new Error('Failed to list projects'));
  });
}

/**
 * Loads a full project by its ID.
 */
export async function loadProjectFromLibrary(id: string): Promise<Project> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      if (request.result) {
        // Strip out the library-only 'updatedAt' field before handing back to the store
        const { updatedAt, ...projectState } = request.result;
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

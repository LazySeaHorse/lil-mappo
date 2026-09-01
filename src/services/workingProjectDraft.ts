import {
  parseProjectDocument,
  toProjectDocument,
  type ProjectDocument,
} from '@/store/projectDocument';
import type { Project } from '@/store/types';

const DB_NAME = 'LilMapWorkingDraftDB';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';
const CURRENT_DRAFT_KEY = 'current';

export const WORKING_DRAFT_SAVE_INTERVAL_MS = 5_000;

interface StoredWorkingDraft {
  key: typeof CURRENT_DRAFT_KEY;
  project: ProjectDocument;
  updatedAt: number;
}

export interface WorkingDraftStorage {
  load(): Promise<Project | null>;
  save(project: ProjectDocument): Promise<void>;
}

function openDraftDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(new Error('Failed to open working draft database'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
  });
}

export const browserWorkingDraftStorage: WorkingDraftStorage = {
  async load() {
    const db = await openDraftDB();
    try {
      return await new Promise<Project | null>((resolve, reject) => {
        const request = db
          .transaction(STORE_NAME, 'readonly')
          .objectStore(STORE_NAME)
          .get(CURRENT_DRAFT_KEY);

        request.onsuccess = () => {
          const stored = request.result as StoredWorkingDraft | undefined;
          if (!stored) {
            resolve(null);
            return;
          }

          try {
            resolve(parseProjectDocument(stored.project));
          } catch {
            reject(new Error('Working draft is corrupted'));
          }
        };
        request.onerror = () => reject(new Error('Failed to load working draft'));
      });
    } finally {
      db.close();
    }
  },

  async save(project) {
    const db = await openDraftDB();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).put({
          key: CURRENT_DRAFT_KEY,
          project,
          updatedAt: Date.now(),
        } satisfies StoredWorkingDraft);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error('Failed to save working draft'));
        transaction.onabort = () => reject(new Error('Failed to save working draft'));
      });
    } finally {
      db.close();
    }
  },
};

/**
 * Coordinates hydration and serialized autosave writes. The latest snapshot is
 * queued while a previous IndexedDB write is in flight, preventing an older
 * write from winning a race with a newer one.
 */
export class WorkingProjectDraftManager {
  private getProject: (() => Project) | null = null;
  private dirty = false;
  private lastSaved = '';
  private queued: { document: ProjectDocument; serialized: string } | null = null;
  private drainPromise: Promise<void> | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly storage: WorkingDraftStorage) {}

  async hydrate(): Promise<Project | null> {
    const project = await this.storage.load();
    if (project) this.lastSaved = JSON.stringify(toProjectDocument(project));
    return project;
  }

  start(getProject: () => Project): void {
    this.stop();
    this.getProject = getProject;
    this.intervalId = setInterval(() => {
      void this.saveIfChanged().catch(() => {
        // Keep the draft dirty so a temporary storage failure retries next tick.
        this.dirty = true;
      });
    }, WORKING_DRAFT_SAVE_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    this.getProject = null;
  }

  markDirty(): void {
    this.dirty = true;
  }

  async saveIfChanged(force = false): Promise<void> {
    if (!this.getProject || (!force && !this.dirty)) return;

    const document = toProjectDocument(this.getProject());
    const serialized = JSON.stringify(document);
    this.dirty = false;

    if (serialized === this.lastSaved || serialized === this.queued?.serialized) {
      return this.drainPromise ?? Promise.resolve();
    }

    this.queued = { document, serialized };
    if (!this.drainPromise) this.drainPromise = this.drain();
    return this.drainPromise;
  }

  /** Saves even when no store mutation was observed, for navigation boundaries. */
  flush(): Promise<void> {
    return this.saveIfChanged(true);
  }

  private async drain(): Promise<void> {
    try {
      while (this.queued) {
        const next = this.queued;
        this.queued = null;
        await this.storage.save(next.document);
        this.lastSaved = next.serialized;
      }
    } catch (error) {
      this.queued = null;
      this.dirty = true;
      throw error;
    } finally {
      this.drainPromise = null;
    }
  }
}

export const workingProjectDraftManager = new WorkingProjectDraftManager(
  browserWorkingDraftStorage,
);

export function flushWorkingProjectDraft(): Promise<void> {
  return workingProjectDraftManager.flush();
}

import {
  parseProjectDocument,
  toProjectDocument,
  type ProjectDocument,
} from '@/store/projectDocument';
import { PERSISTED_PROJECT_KEYS } from '@/store/historyKeys';
import type { Project } from '@/store/types';

const DB_NAME = 'LilMapWorkingDraftDB';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';
const CURRENT_DRAFT_KEY = 'current';

export const WORKING_DRAFT_SAVE_INTERVAL_MS = 5_000;

export type DraftSaveFailure = 'storage-full' | 'storage-unavailable' | 'failed';

/** What the editor shows about the autosave: all changes written, changes waiting, or the last write failed. */
export type DraftSaveStatus =
  | { state: 'saved' }
  | { state: 'saving' }
  | { state: 'error'; reason: DraftSaveFailure };

const SAVED: DraftSaveStatus = { state: 'saved' };
const SAVING: DraftSaveStatus = { state: 'saving' };

/** A failed draft write with a reason a person can act on. */
export class WorkingDraftError extends Error {
  constructor(readonly reason: DraftSaveFailure) {
    super(`Working draft save failed: ${reason}`);
    this.name = 'WorkingDraftError';
  }
}

function sameStatus(a: DraftSaveStatus, b: DraftSaveStatus): boolean {
  return a.state === b.state && (a.state !== 'error' || (b.state === 'error' && a.reason === b.reason));
}

function failureOf(error: unknown): DraftSaveFailure {
  return error instanceof WorkingDraftError ? error.reason : 'failed';
}

function storageFailure(cause: DOMException | null | undefined): WorkingDraftError {
  return new WorkingDraftError(cause?.name === 'QuotaExceededError' ? 'storage-full' : 'storage-unavailable');
}

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

    request.onerror = () => reject(new WorkingDraftError('storage-unavailable'));
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
        transaction.onerror = () => reject(storageFailure(transaction.error));
        transaction.onabort = () => reject(storageFailure(transaction.error));
      });
    } finally {
      db.close();
    }
  },
};

type PersistedKey = (typeof PERSISTED_PROJECT_KEYS)[number];
/** The persisted fields of one project state, held by reference. */
type PersistedRefs = Pick<Project, PersistedKey>;

function pickPersistedRefs(project: Project): PersistedRefs {
  const refs: Partial<PersistedRefs> = {};
  for (const key of PERSISTED_PROJECT_KEYS) (refs as Record<string, unknown>)[key] = project[key];
  return refs as PersistedRefs;
}

function sameRefs(project: Project, refs: PersistedRefs | null): boolean {
  if (!refs) return false;
  for (const key of PERSISTED_PROJECT_KEYS) if (!Object.is(project[key], refs[key])) return false;
  return true;
}

/**
 * Structural equality for plain JSON-like data. Shared subtrees short-circuit on
 * reference, so comparing two store snapshots costs only the parts that changed.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    if (a.length !== other.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], other[i])) return false;
    return true;
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(right, key) || !deepEqual(left[key], right[key])) return false;
  }
  return true;
}

/** True when every persisted field whose reference changed still holds an equal value. */
function sameValues(project: Project, refs: PersistedRefs | null): boolean {
  if (!refs) return false;
  for (const key of PERSISTED_PROJECT_KEYS) {
    if (!Object.is(project[key], refs[key]) && !deepEqual(project[key], refs[key])) return false;
  }
  return true;
}

/**
 * Coordinates hydration and serialized autosave writes. The latest snapshot is
 * queued while a previous IndexedDB write is in flight, preventing an older
 * write from winning a race with a newer one.
 *
 * Change detection is by reference on the persisted fields (the store shares
 * unchanged structure), so an unchanged project costs a few `Object.is` checks.
 * The document is only built and validated when it is actually going to be written.
 */
export class WorkingProjectDraftManager {
  private getProject: (() => Project) | null = null;
  private shouldDefer: (() => boolean) | null = null;
  private dirty = false;
  /** Persisted fields of the last durable write (or the hydrated draft). */
  private saved: PersistedRefs | null = null;
  private queued: { document: ProjectDocument; refs: PersistedRefs } | null = null;
  private drainPromise: Promise<void> | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private status: DraftSaveStatus = SAVED;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly storage: WorkingDraftStorage) {}

  async hydrate(): Promise<Project | null> {
    const project = await this.storage.load();
    // The stored draft is already validated by load(); remember it by reference.
    if (project) this.saved = pickPersistedRefs(project);
    return project;
  }

  /** `shouldDefer` skips interval ticks (e.g. while exporting) and leaves the draft dirty. */
  start(getProject: () => Project, shouldDefer?: () => boolean): void {
    this.stop();
    this.getProject = getProject;
    this.shouldDefer = shouldDefer ?? null;
    this.intervalId = setInterval(() => {
      if (this.shouldDefer?.()) return;
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
    this.shouldDefer = null;
  }

  markDirty(): void {
    this.dirty = true;
    this.setStatus(SAVING);
  }

  /** The current autosave status. The object only changes when the status does. */
  getStatus = (): DraftSaveStatus => this.status;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private setStatus(next: DraftSaveStatus): void {
    if (sameStatus(this.status, next)) return;
    this.status = next;
    this.listeners.forEach((listener) => listener());
  }

  /** Back to saved once nothing is waiting or being written. */
  private settle(): void {
    if (!this.dirty && !this.queued && !this.drainPromise) this.setStatus(SAVED);
  }

  async saveIfChanged(force = false): Promise<void> {
    if (!this.getProject || (!force && !this.dirty)) return;

    const project = this.getProject();
    this.dirty = false;

    if (sameRefs(project, this.saved) || sameRefs(project, this.queued?.refs ?? null)) {
      this.settle();
      return this.drainPromise ?? Promise.resolve();
    }

    // New references with equal values (e.g. a re-parsed hydrated draft, or the
    // map settling on the same center): adopt them so later ticks stay cheap.
    if (!this.queued && !this.drainPromise && sameValues(project, this.saved)) {
      this.saved = pickPersistedRefs(project);
      this.settle();
      return;
    }

    try {
      this.queued = { document: toProjectDocument(project), refs: pickPersistedRefs(project) };
    } catch (error) {
      this.dirty = true;
      this.setStatus({ state: 'error', reason: failureOf(error) });
      throw error;
    }
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
        this.saved = next.refs;
      }
      this.drainPromise = null;
      this.settle();
    } catch (error) {
      this.queued = null;
      this.dirty = true;
      this.drainPromise = null;
      this.setStatus({ state: 'error', reason: failureOf(error) });
      throw error;
    }
  }
}

export const workingProjectDraftManager = new WorkingProjectDraftManager(
  browserWorkingDraftStorage,
);

export function flushWorkingProjectDraft(): Promise<void> {
  return workingProjectDraftManager.flush();
}

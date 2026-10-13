import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject, parseProjectDocument, toProjectDocument } from '@/store/projectDocument';

vi.mock('@/store/projectDocument', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/projectDocument')>();
  return { ...actual, toProjectDocument: vi.fn(actual.toProjectDocument) };
});
import {
  WORKING_DRAFT_SAVE_INTERVAL_MS,
  WorkingDraftError,
  WorkingProjectDraftManager,
  type WorkingDraftStorage,
} from './workingProjectDraft';

describe('WorkingProjectDraftManager', () => {
  let saved: ReturnType<typeof toProjectDocument>[];
  let storage: WorkingDraftStorage;

  beforeEach(() => {
    vi.useFakeTimers();
    saved = [];
    storage = {
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn(async (project) => {
        saved.push(project);
      }),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(toProjectDocument).mockClear();
  });

  it('hydrates without serialising the restored draft', async () => {
    vi.mocked(storage.load).mockResolvedValue(createProject({ id: 'restored' }));
    vi.mocked(toProjectDocument).mockClear();
    const manager = new WorkingProjectDraftManager(storage);

    await manager.hydrate();

    expect(toProjectDocument).not.toHaveBeenCalled();
  });

  it('does not rewrite a hydrated draft once the store holds a re-parsed copy', async () => {
    const restored = createProject({ id: 'restored', name: 'Restored draft' });
    vi.mocked(storage.load).mockResolvedValue(restored);
    const manager = new WorkingProjectDraftManager(storage);
    await manager.hydrate();

    // loadFullProject parses again, so the store holds equal values under new references.
    const inStore = parseProjectDocument(toProjectDocument(restored));
    manager.start(() => inStore);
    manager.markDirty();
    await vi.advanceTimersByTimeAsync(WORKING_DRAFT_SAVE_INTERVAL_MS);

    expect(storage.save).not.toHaveBeenCalled();
    manager.stop();
  });

  it('does not serialise again when no persisted reference changed', async () => {
    const project = createProject({ id: 'draft', name: 'Saved' });
    let state: typeof project & { playheadTime?: number } = project;
    const manager = new WorkingProjectDraftManager(storage);
    manager.start(() => state);
    await manager.flush();
    vi.mocked(toProjectDocument).mockClear();

    // Transient churn (a new store object, same persisted references).
    state = { ...project, playheadTime: 3 };
    manager.markDirty();
    await vi.advanceTimersByTimeAsync(WORKING_DRAFT_SAVE_INTERVAL_MS);

    expect(toProjectDocument).not.toHaveBeenCalled();
    expect(storage.save).toHaveBeenCalledTimes(1);
    manager.stop();
  });

  it('skips serialising when a changed reference holds an equal value', async () => {
    const project = createProject({ id: 'draft', mapCenter: [1, 2] });
    let state = project;
    const manager = new WorkingProjectDraftManager(storage);
    manager.start(() => state);
    await manager.flush();
    vi.mocked(toProjectDocument).mockClear();

    state = { ...project, mapCenter: [1, 2] };
    manager.markDirty();
    await vi.advanceTimersByTimeAsync(WORKING_DRAFT_SAVE_INTERVAL_MS);

    expect(toProjectDocument).not.toHaveBeenCalled();
    expect(storage.save).toHaveBeenCalledTimes(1);
    manager.stop();
  });

  it('saves a moved map center', async () => {
    const project = createProject({ id: 'draft', mapCenter: [1, 2] });
    let state = project;
    const manager = new WorkingProjectDraftManager(storage);
    manager.start(() => state);
    await manager.flush();

    state = { ...project, mapCenter: [3, 4] };
    manager.markDirty();
    await vi.advanceTimersByTimeAsync(WORKING_DRAFT_SAVE_INTERVAL_MS);

    expect(saved).toHaveLength(2);
    expect(saved[1].mapCenter).toEqual([3, 4]);
    manager.stop();
  });

  it('does not save again after an undo restores the saved references', async () => {
    const project = createProject({ id: 'draft', name: 'Saved' });
    let state = project;
    const manager = new WorkingProjectDraftManager(storage);
    manager.start(() => state);
    await manager.flush();

    state = { ...project, name: 'Edited' };
    manager.markDirty();
    state = project;
    await vi.advanceTimersByTimeAsync(WORKING_DRAFT_SAVE_INTERVAL_MS);

    expect(storage.save).toHaveBeenCalledTimes(1);
    manager.stop();
  });

  it('hydrates and remembers the stored document without rewriting it', async () => {
    const project = createProject({ id: 'restored', name: 'Restored draft' });
    vi.mocked(storage.load).mockResolvedValue(project);
    const manager = new WorkingProjectDraftManager(storage);

    await expect(manager.hydrate()).resolves.toEqual(project);
    manager.start(() => project);
    manager.markDirty();
    await vi.advanceTimersByTimeAsync(WORKING_DRAFT_SAVE_INTERVAL_MS);

    expect(storage.save).not.toHaveBeenCalled();
    manager.stop();
  });

  it('saves a dirty project on the next five-second tick', async () => {
    let project = createProject({ id: 'draft', name: 'First name' });
    const manager = new WorkingProjectDraftManager(storage);
    manager.start(() => project);

    manager.markDirty();
    await vi.advanceTimersByTimeAsync(WORKING_DRAFT_SAVE_INTERVAL_MS - 1);
    expect(storage.save).not.toHaveBeenCalled();

    project = { ...project, name: 'Changed name' };
    await vi.advanceTimersByTimeAsync(1);
    expect(saved).toEqual([toProjectDocument(project)]);
    manager.stop();
  });

  it('defers ticks while shouldDefer is true and saves once it clears', async () => {
    let busy = true;
    const project = createProject({ id: 'draft', name: 'Busy' });
    const manager = new WorkingProjectDraftManager(storage);
    manager.start(() => project, () => busy);

    manager.markDirty();
    await vi.advanceTimersByTimeAsync(WORKING_DRAFT_SAVE_INTERVAL_MS);
    expect(storage.save).not.toHaveBeenCalled();

    busy = false;
    await vi.advanceTimersByTimeAsync(WORKING_DRAFT_SAVE_INTERVAL_MS);
    expect(storage.save).toHaveBeenCalledTimes(1);
    manager.stop();
  });

  it('does not rewrite an unchanged durable document', async () => {
    const project = createProject({ id: 'draft' });
    const manager = new WorkingProjectDraftManager(storage);
    manager.start(() => project);

    manager.markDirty();
    await vi.advanceTimersByTimeAsync(WORKING_DRAFT_SAVE_INTERVAL_MS);
    manager.markDirty();
    await vi.advanceTimersByTimeAsync(WORKING_DRAFT_SAVE_INTERVAL_MS);

    expect(storage.save).toHaveBeenCalledTimes(1);
    manager.stop();
  });

  it('flushes immediately without waiting for the interval', async () => {
    const project = createProject({ id: 'draft', name: 'Before auth' });
    const manager = new WorkingProjectDraftManager(storage);
    manager.start(() => project);

    await manager.flush();

    expect(saved).toEqual([toProjectDocument(project)]);
    manager.stop();
  });

  it('retries a failed write on the following interval', async () => {
    const project = createProject({ id: 'draft', name: 'Retry me' });
    vi.mocked(storage.save)
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockImplementationOnce(async (document) => {
        saved.push(document);
      });
    const manager = new WorkingProjectDraftManager(storage);
    manager.start(() => project);
    manager.markDirty();

    await vi.advanceTimersByTimeAsync(WORKING_DRAFT_SAVE_INTERVAL_MS);
    expect(saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(WORKING_DRAFT_SAVE_INTERVAL_MS);

    expect(saved).toEqual([toProjectDocument(project)]);
    expect(storage.save).toHaveBeenCalledTimes(2);
    manager.stop();
  });

  describe('save status', () => {
    it('starts saved, shows saving while changes wait, and is saved after the write', async () => {
      const project = createProject({ id: 'draft', name: 'Status' });
      const manager = new WorkingProjectDraftManager(storage);
      expect(manager.getStatus()).toEqual({ state: 'saved' });

      manager.start(() => project);
      manager.markDirty();
      expect(manager.getStatus()).toEqual({ state: 'saving' });

      await vi.advanceTimersByTimeAsync(WORKING_DRAFT_SAVE_INTERVAL_MS);
      expect(manager.getStatus()).toEqual({ state: 'saved' });
      manager.stop();
    });

    it('tells subscribers only when the status changes', async () => {
      const project = createProject({ id: 'draft', name: 'Notify' });
      const manager = new WorkingProjectDraftManager(storage);
      const listener = vi.fn();
      const off = manager.subscribe(listener);
      manager.start(() => project);

      manager.markDirty();
      manager.markDirty();
      manager.markDirty();
      expect(listener).toHaveBeenCalledTimes(1);

      await manager.flush();
      expect(listener).toHaveBeenCalledTimes(2);

      off();
      manager.markDirty();
      expect(listener).toHaveBeenCalledTimes(2);
      manager.stop();
    });

    it('keeps the same status object while nothing changes, for useSyncExternalStore', () => {
      const manager = new WorkingProjectDraftManager(storage);
      const first = manager.getStatus();
      manager.markDirty();
      const saving = manager.getStatus();
      manager.markDirty();
      expect(manager.getStatus()).toBe(saving);
      expect(first).not.toBe(saving);
    });

    it('reports why a write failed, and recovers on the next write', async () => {
      const project = createProject({ id: 'draft', name: 'Full' });
      vi.mocked(storage.save)
        .mockRejectedValueOnce(new WorkingDraftError('storage-full'))
        .mockImplementationOnce(async (document) => {
          saved.push(document);
        });
      const manager = new WorkingProjectDraftManager(storage);
      manager.start(() => project);
      manager.markDirty();

      await vi.advanceTimersByTimeAsync(WORKING_DRAFT_SAVE_INTERVAL_MS);
      expect(manager.getStatus()).toEqual({ state: 'error', reason: 'storage-full' });

      await vi.advanceTimersByTimeAsync(WORKING_DRAFT_SAVE_INTERVAL_MS);
      expect(manager.getStatus()).toEqual({ state: 'saved' });
      manager.stop();
    });

    it('reports an unknown failure as failed', async () => {
      const project = createProject({ id: 'draft', name: 'Odd' });
      vi.mocked(storage.save).mockRejectedValueOnce(new Error('boom'));
      const manager = new WorkingProjectDraftManager(storage);
      manager.start(() => project);
      manager.markDirty();

      await vi.advanceTimersByTimeAsync(WORKING_DRAFT_SAVE_INTERVAL_MS);
      expect(manager.getStatus()).toEqual({ state: 'error', reason: 'failed' });
      manager.stop();
    });

    it('stays saving when more changes arrive during a write', async () => {
      const project = createProject({ id: 'draft', name: 'Busy' });
      let finish!: () => void;
      vi.mocked(storage.save).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
      const manager = new WorkingProjectDraftManager(storage);
      manager.start(() => project);
      manager.markDirty();

      const flushing = manager.flush();
      manager.markDirty();
      finish();
      await flushing;

      expect(manager.getStatus()).toEqual({ state: 'saving' });
      manager.stop();
    });

    it('is saved when the changed values equal the saved ones', async () => {
      const restored = createProject({ id: 'restored', name: 'Restored' });
      vi.mocked(storage.load).mockResolvedValue(restored);
      const manager = new WorkingProjectDraftManager(storage);
      await manager.hydrate();
      const inStore = parseProjectDocument(toProjectDocument(restored));
      manager.start(() => inStore);
      manager.markDirty();
      expect(manager.getStatus()).toEqual({ state: 'saving' });

      await vi.advanceTimersByTimeAsync(WORKING_DRAFT_SAVE_INTERVAL_MS);
      expect(manager.getStatus()).toEqual({ state: 'saved' });
      manager.stop();
    });
  });
});

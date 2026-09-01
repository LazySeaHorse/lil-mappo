import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject, toProjectDocument } from '@/store/projectDocument';
import {
  WORKING_DRAFT_SAVE_INTERVAL_MS,
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
});

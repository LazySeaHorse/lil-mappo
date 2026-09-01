import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '@/store/projectDocument';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { useWorkingProjectDraft } from './useWorkingProjectDraft';

const draftManager = vi.hoisted(() => ({
  hydrate: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  markDirty: vi.fn(),
  flush: vi.fn(),
}));

vi.mock('@/services/workingProjectDraft', () => ({
  workingProjectDraftManager: draftManager,
}));

describe('useWorkingProjectDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    draftManager.hydrate.mockResolvedValue(null);
    draftManager.flush.mockResolvedValue(undefined);
    useProjectStore.setState({
      ...createProject({ id: 'initial', name: 'Initial project' }),
      ...createTransientState(),
    });
  });

  it('restores the draft before marking the editor ready', async () => {
    const restored = createProject({ id: 'restored', name: 'Recovered project' });
    draftManager.hydrate.mockResolvedValue(restored);

    const { result } = renderHook(() => useWorkingProjectDraft());
    expect(result.current).toBe(false);

    await waitFor(() => expect(result.current).toBe(true));
    expect(useProjectStore.getState().id).toBe('restored');
    expect(useProjectStore.getState().name).toBe('Recovered project');
    expect(draftManager.start).toHaveBeenCalledOnce();
  });

  it('marks the draft dirty after store mutations and flushes on pagehide', async () => {
    const { result } = renderHook(() => useWorkingProjectDraft());
    await waitFor(() => expect(result.current).toBe(true));

    act(() => useProjectStore.setState({ name: 'Edited project' }));
    expect(draftManager.markDirty).toHaveBeenCalledOnce();

    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(draftManager.flush).toHaveBeenCalledOnce();
  });

  it('opens the editor when draft storage is unavailable', async () => {
    draftManager.hydrate.mockRejectedValue(new Error('IndexedDB unavailable'));

    const { result } = renderHook(() => useWorkingProjectDraft());

    await waitFor(() => expect(result.current).toBe(true));
    expect(useProjectStore.getState().id).toBe('initial');
    expect(draftManager.start).toHaveBeenCalledOnce();
  });
});

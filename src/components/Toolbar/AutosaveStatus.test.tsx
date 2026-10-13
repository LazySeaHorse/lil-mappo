import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '@/store/projectDocument';

const { storage } = vi.hoisted(() => ({
  storage: { load: vi.fn(async () => null), save: vi.fn(async () => {}) },
}));

vi.mock('@/services/workingProjectDraft', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/workingProjectDraft')>();
  return { ...actual, workingProjectDraftManager: new actual.WorkingProjectDraftManager(storage) };
});

import { WorkingDraftError, workingProjectDraftManager } from '@/services/workingProjectDraft';
import { AutosaveStatus } from './AutosaveStatus';

afterEach(() => {
  workingProjectDraftManager.stop();
  storage.save.mockReset().mockResolvedValue(undefined);
});

describe('<AutosaveStatus />', () => {
  it('says the work is saved on this device', () => {
    render(<AutosaveStatus />);
    expect(screen.getByRole('status')).toHaveAttribute('title', 'Saved on this device');
  });

  it('says it is saving while changes wait, then saved again', async () => {
    render(<AutosaveStatus />);
    const project = createProject({ id: 'p' });
    workingProjectDraftManager.start(() => project);

    act(() => workingProjectDraftManager.markDirty());
    expect(screen.getByRole('status')).toHaveAttribute('title', 'Saving…');

    await act(() => workingProjectDraftManager.flush());
    expect(screen.getByRole('status')).toHaveAttribute('title', 'Saved on this device');
  });

  it('says why the work is not saved', async () => {
    storage.save.mockRejectedValueOnce(new WorkingDraftError('storage-full'));
    render(<AutosaveStatus />);
    const project = createProject({ id: 'q' });
    workingProjectDraftManager.start(() => project);
    act(() => workingProjectDraftManager.markDirty());

    await act(async () => { await workingProjectDraftManager.flush().catch(() => {}); });
    expect(screen.getByRole('status')).toHaveAttribute('title', 'Not saved: your device is out of storage.');
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewProjectModal } from './NewProjectModal';
import { useProjectStore } from '@/store/useProjectStore';

const mocks = vi.hoisted(() => ({ subscription: null as unknown }));

vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: mocks.subscription }) }));
vi.mock('@/hooks/useFeatureVotes', () => ({ useFeatureVoted: () => false }));
vi.mock('@/lib/cloudAccess', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cloudAccess')>()),
  hasByok: () => false,
}));

beforeEach(() => {
  mocks.subscription = null;
  useProjectStore.setState({ showNewProjectModal: true });
});

describe('NewProjectModal plan limits', () => {
  it('keeps 60 FPS out of reach on the free plan', () => {
    render(<NewProjectModal />);
    expect(screen.getByRole('radio', { name: '60 FPS' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: '30 FPS' })).not.toBeDisabled();
  });

  it('keeps 4K out of reach on the free plan', () => {
    render(<NewProjectModal />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(screen.getByRole('option', { name: /4K/ }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('option', { name: /720p/ }).getAttribute('aria-disabled')).toBeNull();
  });

  it('starts a free project at the highest resolution the plan allows', () => {
    render(<NewProjectModal />);
    expect(screen.getByRole('combobox')).toHaveTextContent('720p');
  });
});

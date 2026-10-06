import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const votesState = vi.hoisted(() => ({
  value: { data: undefined, isError: false } as { data: unknown; isError: boolean },
}));
const mutate = vi.hoisted(() => vi.fn());
const track = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useFeatureVotes', () => ({
  useFeatureVotes: () => votesState.value,
  useSetFeatureVote: () => ({ mutate }),
}));
vi.mock('@/lib/analytics', () => ({ track }));

import { useAuthStore } from '@/store/useAuthStore';
import { FeatureVoteDialog } from './FeatureVoteDialog';
import { FeatureVoteButton } from './FeatureVoteButton';

const summary = (over: Record<string, unknown> = {}) => ({
  feature_id: 'cloud-render', tier: 'some', most_requested: false, has_voted: false, ...over,
});

describe('FeatureVoteDialog', () => {
  beforeEach(() => {
    mutate.mockReset();
    track.mockReset();
    votesState.value = { data: undefined, isError: false };
    useAuthStore.setState({ user: null });
  });

  it('signed out: shows the preview, no tier, and routes "Sign in to vote" to sign-in', () => {
    const requestSignIn = vi.fn();
    useAuthStore.setState({ requestSignIn });
    const onOpenChange = vi.fn();
    render(<FeatureVoteDialog featureId="cloud-render" open onOpenChange={onOpenChange} />);

    expect(screen.getByTestId('feature-skeleton')).toBeTruthy();
    expect(screen.queryByText(/people want this/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to vote' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(requestSignIn).toHaveBeenCalledWith('Sign in to vote for upcoming features.');
    expect(mutate).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalledWith('feature_voted', expect.anything());
  });

  it('signed in: shows tier copy and the most requested badge', () => {
    useAuthStore.setState({ user: { id: 'u1' } as never });
    votesState.value = { data: [summary({ tier: 'many', most_requested: true })], isError: false };
    render(<FeatureVoteDialog featureId="cloud-render" open onOpenChange={() => {}} />);
    expect(screen.getByText('Lots of people want this')).toBeTruthy();
    expect(screen.getByText('Most requested')).toBeTruthy();
  });

  it('signed in: toggles the vote and tracks it', () => {
    useAuthStore.setState({ user: { id: 'u1' } as never });
    votesState.value = { data: [summary()], isError: false };
    const { rerender } = render(<FeatureVoteDialog featureId="cloud-render" open onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /I'd like this/ }));
    expect(mutate).toHaveBeenCalledWith({ featureId: 'cloud-render', voted: true });
    expect(track).toHaveBeenCalledWith('feature_voted', { feature_id: 'cloud-render' });

    votesState.value = { data: [summary({ has_voted: true })], isError: false };
    rerender(<FeatureVoteDialog featureId="cloud-render" open onOpenChange={() => {}} />);
    const pressed = screen.getByRole('button', { name: /You'd like this/ });
    expect(pressed.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(pressed);
    expect(mutate).toHaveBeenLastCalledWith({ featureId: 'cloud-render', voted: false });
    expect(track).toHaveBeenCalledWith('feature_unvoted', { feature_id: 'cloud-render' });
  });

  it('tracks feature_preview_opened once per opening', () => {
    render(<FeatureVoteButton featureId="example-projects" />);
    expect(track).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /I'd like this/ }));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('feature_preview_opened', { feature_id: 'example-projects' });
    expect(screen.getByText(/publish their own projects/)).toBeTruthy();
  });
});

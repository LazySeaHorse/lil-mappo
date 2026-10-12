import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const votesState = vi.hoisted(() => ({
  value: { data: undefined, isError: false } as { data: unknown; isError: boolean; refetch?: () => void },
}));
const mutate = vi.hoisted(() => vi.fn());
const refetch = vi.hoisted(() => vi.fn());
const pending = vi.hoisted(() => ({ value: false }));
const track = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useFeatureVotes', () => ({
  useFeatureVotes: () => votesState.value,
  useFeatureVoted: (id: string) =>
    ((votesState.value.data as Array<{ feature_id: string; has_voted: boolean }> | undefined)?.find((r) => r.feature_id === id)?.has_voted) ?? false,
  useSetFeatureVote: () => ({ mutate, isPending: pending.value }),
}));
vi.mock('@/lib/analytics', () => ({ track }));

import { useAuthStore } from '@/store/useAuthStore';
import { FeatureVoteDialog } from './FeatureVoteDialog';
import { UpcomingFeature } from './UpcomingFeature';

const summary = (over: Record<string, unknown> = {}) => ({
  feature_id: 'cloud-render', tier: 'some', most_requested: false, has_voted: false, ...over,
});

describe('FeatureVoteDialog', () => {
  beforeEach(() => {
    mutate.mockReset();
    refetch.mockReset();
    pending.value = false;
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
    expect(screen.getByText('Top request')).toBeTruthy();
  });

  it('signed in: toggles the vote and tracks it', () => {
    useAuthStore.setState({ user: { id: 'u1' } as never });
    votesState.value = { data: [summary()], isError: false };
    const { rerender } = render(<FeatureVoteDialog featureId="cloud-render" open onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /I'd like this/ }));
    expect(mutate).toHaveBeenCalledWith({ featureId: 'cloud-render', voted: true });

    votesState.value = { data: [summary({ has_voted: true })], isError: false };
    rerender(<FeatureVoteDialog featureId="cloud-render" open onOpenChange={() => {}} />);
    const pressed = screen.getByRole('button', { name: /I'd like this/ });
    expect(pressed.getAttribute('aria-pressed')).toBe('true');
    expect(pressed.textContent).toBe('You asked for this');
    fireEvent.click(pressed);
    expect(mutate).toHaveBeenLastCalledWith({ featureId: 'cloud-render', voted: false });
  });

  it('keeps one stable label and makes the button inert (aria-disabled, focus kept) while a vote is being saved', () => {
    useAuthStore.setState({ user: { id: 'u1' } as never });
    votesState.value = { data: [summary()], isError: false };
    pending.value = true;
    const { rerender } = render(<FeatureVoteDialog featureId="cloud-render" open onOpenChange={() => {}} />);
    const button = screen.getByRole('button', { name: "I'd like this" }) as HTMLButtonElement;
    expect(button.getAttribute('aria-disabled')).toBe('true');
    // Not natively disabled: a disabled button drops keyboard focus to <body> in Chromium.
    expect(button.disabled).toBe(false);
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(mutate).not.toHaveBeenCalled();

    pending.value = false;
    votesState.value = { data: [summary({ has_voted: true })], isError: false };
    rerender(<FeatureVoteDialog featureId="cloud-render" open onOpenChange={() => {}} />);
    expect(screen.getByRole('button', { name: "I'd like this" }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: "I'd like this" }).getAttribute('aria-disabled')).toBe('false');
  });

  it('announces loading and tier text in a polite live region', () => {
    useAuthStore.setState({ user: { id: 'u1' } as never });
    render(<FeatureVoteDialog featureId="cloud-render" open onOpenChange={() => {}} />);
    expect(screen.getByText('Loading votes…').closest('[aria-live="polite"]')).toBeTruthy();
  });

  it('shows a retry when the votes cannot be loaded', () => {
    useAuthStore.setState({ user: { id: 'u1' } as never });
    votesState.value = { data: undefined, isError: true, refetch };
    render(<FeatureVoteDialog featureId="cloud-render" open onOpenChange={() => {}} />);
    expect(screen.getByText(/Could not load votes/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('describes the feature as not built yet', () => {
    render(<FeatureVoteDialog featureId="cloud-render" open onOpenChange={() => {}} />);
    expect(screen.getByText('Not built yet')).toBeTruthy();
    expect(screen.queryByText('Not available yet')).toBeNull();
  });

  it('tracks feature_preview_opened once per opening', () => {
    render(<UpcomingFeature featureId="example-projects" variant="inline" />);
    expect(track).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /I'd like this/ }));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('feature_preview_opened', { feature_id: 'example-projects' });
    expect(screen.getByText(/publish their own projects/)).toBeTruthy();
  });
});

describe('UpcomingFeature trigger', () => {
  beforeEach(() => {
    track.mockReset();
    votesState.value = { data: undefined, isError: false };
    useAuthStore.setState({ user: null });
  });

  it('control: one named tab stop, never natively disabled, opens the dialog', () => {
    render(<UpcomingFeature featureId="cloud-render" variant="control" />);
    const trigger = screen.getByRole('button', { name: 'Cloud render, not built yet' }) as HTMLButtonElement;
    expect(trigger.disabled).toBe(false);
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.querySelector('[data-voted="false"]')).toBeTruthy();
    expect(screen.queryByText(/Not available yet/)).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Cloud render' })).toBeTruthy();
  });

  it('control: signed-in vote shows the filled heart and names the state', () => {
    useAuthStore.setState({ user: { id: 'u1' } as never });
    votesState.value = { data: [summary({ has_voted: true })], isError: false };
    render(<UpcomingFeature featureId="cloud-render" variant="control" />);
    const trigger = screen.getByRole('button', { name: 'Cloud render, not built yet, you asked for it' });
    expect(trigger.querySelector('[data-voted="true"]')).toBeTruthy();
    // A saved vote that loads in must not play the vote animation.
    expect(trigger.querySelector('.wish-pop')).toBeNull();
  });

  it('inline: swaps copy and name when voted', () => {
    useAuthStore.setState({ user: { id: 'u1' } as never });
    votesState.value = { data: [summary({ feature_id: 'example-projects', has_voted: true })], isError: false };
    render(<UpcomingFeature featureId="example-projects" variant="inline" />);
    const trigger = screen.getByRole('button', { name: 'You asked for this, Example projects' });
    expect(trigger.textContent).toBe('You asked');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('does not need a QueryClient while signed out', () => {
    expect(() => render(<UpcomingFeature featureId="cloud-render" variant="control" />)).not.toThrow();
  });
});

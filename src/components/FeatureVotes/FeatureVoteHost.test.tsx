import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/hooks/useFeatureVotes', () => ({
  useFeatureVotes: () => ({ data: undefined, isError: false }),
  useFeatureVoted: () => false,
  useSetFeatureVote: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

import { FeatureVoteHost } from './FeatureVoteHost';
import { openFeatureVote } from './featureVoteHostState';
import { UpcomingFeatureRow } from './UpcomingFeature';

describe('FeatureVoteHost', () => {
  it('shows nothing until a feature is asked for, then its dialog', () => {
    render(<FeatureVoteHost />);
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => openFeatureVote('google-earth'));
    expect(screen.getByRole('dialog', { name: 'Google Earth' })).toBeTruthy();
    expect(screen.getByText(/photographed buildings/)).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the dialog when the row that opened it goes away', () => {
    function List() {
      const [open, setOpen] = React.useState(true);
      return (
        <>
          {open && <UpcomingFeatureRow featureId="google-earth" icon={<svg />} hint="Real 3D" onOpen={() => setOpen(false)} />}
          <FeatureVoteHost />
        </>
      );
    }
    render(<List />);
    act(() => screen.getByRole('button', { name: 'Google Earth, not built yet' }).click());

    expect(screen.queryByRole('button', { name: 'Google Earth, not built yet' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Google Earth' })).toBeTruthy();
  });
});

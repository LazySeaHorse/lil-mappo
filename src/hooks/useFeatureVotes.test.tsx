import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpcMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: rpcMock } }));

import { useAuthStore } from '@/store/useAuthStore';
import { useFeatureVotes, useSetFeatureVote } from './useFeatureVotes';

const rows = [
  { feature_id: 'cloud-render', tier: 'some', most_requested: false, has_voted: false },
  { feature_id: 'example-projects', tier: 'none', most_requested: false, has_voted: false },
];

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe('feature vote hooks', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    useAuthStore.setState({ user: { id: 'u1' } as never });
  });

  it('does not call the server until enabled', async () => {
    rpcMock.mockResolvedValue({ data: rows, error: null });
    const { wrapper } = setup();
    const { rerender, result } = renderHook(({ on }) => useFeatureVotes(on), { wrapper, initialProps: { on: false } });
    expect(rpcMock).not.toHaveBeenCalled();
    rerender({ on: true });
    await waitFor(() => expect(result.current.data).toEqual(rows));
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('get_feature_vote_summaries', {
      p_feature_ids: ['cloud-render', 'example-projects'],
    });
  });

  it('does not call the server when signed out', () => {
    useAuthStore.setState({ user: null });
    const { wrapper } = setup();
    renderHook(() => useFeatureVotes(true), { wrapper });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('flips has_voted optimistically and rolls back on failure', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(['feature_votes', 'u1'], rows);
    let reject!: (e: unknown) => void;
    rpcMock.mockImplementation(
      () => new Promise((_res, rej) => { reject = rej; }),
    );
    const { result } = renderHook(() => useSetFeatureVote(), { wrapper });

    act(() => { result.current.mutate({ featureId: 'cloud-render', voted: true }); });
    await waitFor(() => {
      const cached = client.getQueryData<typeof rows>(['feature_votes', 'u1']);
      expect(cached?.[0].has_voted).toBe(true);
    });
    expect(rpcMock).toHaveBeenCalledWith('set_feature_vote', { p_feature_id: 'cloud-render', p_voted: true });

    await act(async () => { reject(new Error('boom')); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData<typeof rows>(['feature_votes', 'u1'])?.[0].has_voted).toBe(false);
  });
});

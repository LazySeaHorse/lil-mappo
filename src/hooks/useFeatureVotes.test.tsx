import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpcMock = vi.hoisted(() => vi.fn());
const track = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics', () => ({ track }));
vi.mock('sonner', () => ({ toast: { error: toastError } }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: rpcMock } }));

import { useAuthStore } from '@/store/useAuthStore';
import { useFeatureVotes, useFeatureVoted, useSetFeatureVote } from './useFeatureVotes';

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
    track.mockReset();
    toastError.mockReset();
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

  it('useFeatureVoted fetches on mount for signed-in users and reports their vote', async () => {
    rpcMock.mockResolvedValue({ data: [{ ...rows[0], has_voted: true }, rows[1]], error: null });
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({ a: useFeatureVoted('cloud-render'), b: useFeatureVoted('example-projects') }),
      { wrapper },
    );
    expect(result.current).toEqual({ a: false, b: false });
    await waitFor(() => expect(result.current.a).toBe(true));
    expect(result.current.b).toBe(false);
    // Two triggers share one batched request.
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('useFeatureVoted makes no request when signed out', () => {
    useAuthStore.setState({ user: null });
    const { wrapper } = setup();
    const { result } = renderHook(() => useFeatureVoted('cloud-render'), { wrapper });
    expect(result.current).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
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
    expect(track).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it('tracks only after the vote was saved', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(['feature_votes', 'u1'], rows);
    let resolve!: (v: unknown) => void;
    rpcMock.mockImplementation(() => new Promise((res) => { resolve = res; }));
    const { result } = renderHook(() => useSetFeatureVote(), { wrapper });

    act(() => { result.current.mutate({ featureId: 'cloud-render', voted: true }); });
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(track).not.toHaveBeenCalled();
    await act(async () => { resolve({ data: true, error: null }); });
    await waitFor(() => expect(track).toHaveBeenCalledWith('feature_voted', { feature_id: 'cloud-render' }));
  });

  it('a failed vote only restores its own row, not a newer optimistic state', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(['feature_votes', 'u1'], rows);
    const rejects: Array<(e: unknown) => void> = [];
    rpcMock.mockImplementation(() => new Promise((_res, rej) => { rejects.push(rej); }));
    const { result } = renderHook(() => useSetFeatureVote(), { wrapper });

    act(() => { result.current.mutate({ featureId: 'cloud-render', voted: true }); });
    act(() => { result.current.mutate({ featureId: 'example-projects', voted: true }); });
    await waitFor(() => expect(rejects).toHaveLength(2));
    await act(async () => { rejects[0](new Error('boom')); });
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    const cached = client.getQueryData<typeof rows>(['feature_votes', 'u1'])!;
    expect(cached[0].has_voted).toBe(false);
    expect(cached[1].has_voted).toBe(true);
  });
});

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rows = vi.hoisted(() => ({
  subscriptions: [] as Array<{ data: unknown; error: unknown }>,
  pro_passes: [] as Array<{ data: unknown; error: unknown }>,
  calls: [] as Array<[string, string, unknown]>,
}));

vi.mock('@/lib/supabase', () => {
  function builder(table: 'subscriptions' | 'pro_passes') {
    const chain = {
      select: () => chain,
      eq: (col: string, value: unknown) => (rows.calls.push([table, `eq:${col}`, value]), chain),
      in: (col: string, value: unknown) => (rows.calls.push([table, `in:${col}`, value]), chain),
      gt: (col: string, value: unknown) => (rows.calls.push([table, `gt:${col}`, value]), chain),
      maybeSingle: async () => {
        const queue = rows[table];
        return queue.length > 1 ? queue.shift()! : queue[0] ?? { data: null, error: null };
      },
    };
    return chain;
  }
  return { supabase: { from: (table: 'subscriptions' | 'pro_passes') => builder(table) } };
});

import { useAuthStore } from '@/store/useAuthStore';
import { isWanderer } from '@/lib/cloudAccess';
import { passRefetchInterval, useSubscription } from './useSubscription';

const ACTIVE_SUB = {
  user_id: 'u1',
  tier: 'wanderer',
  status: 'active',
  monthly_credits: 100,
  parallel_renders: 1,
  renewal_date: '2099-01-01',
  dodo_subscription_id: 'sub-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe('useSubscription', () => {
  beforeEach(() => {
    rows.subscriptions = [];
    rows.pro_passes = [];
    rows.calls = [];
    useAuthStore.setState({ user: { id: 'u1' } as never });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null for a free user', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useSubscription(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('merges an active pass into a pass-only row that every gate accepts', async () => {
    const end = new Date(Date.now() + 3 * 86_400_000).toISOString();
    rows.pro_passes = [{ data: { expires_at: end }, error: null }];
    const { wrapper } = setup();
    const { result } = renderHook(() => useSubscription(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ user_id: 'u1', status: 'none', pass_expires_at: end });
    expect(isWanderer(result.current.data)).toBe(true);
    expect(rows.calls).toContainEqual(['pro_passes', 'eq:user_id', 'u1']);
  });

  it('keeps the subscription row as it is and adds the pass end', async () => {
    const end = new Date(Date.now() + 86_400_000).toISOString();
    rows.subscriptions = [{ data: ACTIVE_SUB, error: null }];
    rows.pro_passes = [{ data: { expires_at: end }, error: null }];
    const { wrapper } = setup();
    const { result } = renderHook(() => useSubscription(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ ...ACTIVE_SUB, pass_expires_at: end });
  });

  it('keeps a subscriber paid when the pass lookup fails', async () => {
    rows.subscriptions = [{ data: ACTIVE_SUB, error: null }];
    rows.pro_passes = [{ data: null, error: { message: 'relation does not exist' } }];
    const { wrapper } = setup();
    const { result } = renderHook(() => useSubscription(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(isWanderer(result.current.data)).toBe(true);
  });

  it('refetches when the pass ends, so gates lock without a reload', async () => {
    const end = new Date(Date.now() + 200).toISOString();
    rows.pro_passes = [
      { data: { expires_at: end }, error: null },
      { data: null, error: null },
    ];
    const { wrapper } = setup();
    const { result } = renderHook(() => useSubscription(), { wrapper });

    await waitFor(() => expect(result.current.data?.pass_expires_at).toBe(end));
    await waitFor(() => expect(result.current.data).toBeNull(), { timeout: 4000 });
  });
});

describe('passRefetchInterval', () => {
  const now = Date.parse('2026-10-18T12:00:00Z');

  it('does not poll without an active pass', () => {
    expect(passRefetchInterval(null, now)).toBe(false);
    expect(passRefetchInterval({ pass_expires_at: '2026-10-18T11:00:00Z' } as never, now)).toBe(false);
  });

  it('refetches just after the pass ends', () => {
    expect(passRefetchInterval({ pass_expires_at: '2026-10-18T12:10:00Z' } as never, now)).toBe(10 * 60_000 + 1000);
  });

  it('checks again at least every six hours for long (stacked) passes', () => {
    expect(passRefetchInterval({ pass_expires_at: '2026-11-30T12:00:00Z' } as never, now)).toBe(6 * 3_600_000);
  });
});

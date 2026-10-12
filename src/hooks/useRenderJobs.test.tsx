import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { useAuthStore } from '@/store/useAuthStore';
import { useRenderJobs } from './useRenderJobs';

const select = vi.fn();
vi.mock('@/lib/supabase', () => {
  const chain = {
    select: (cols: string) => { select(cols); return chain; },
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: [{ id: 'job-1', status: 'done' }], error: null }),
  };
  return { supabase: { from: () => chain } };
});

describe('useRenderJobs', () => {
  it('selects only the listed columns, never the project payload', async () => {
    useAuthStore.setState({ user: { id: 'user-1' } as never });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useRenderJobs(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'job-1', status: 'done' }]));

    const columns = select.mock.calls[0][0].split(',');
    expect(columns).toEqual(expect.arrayContaining(['id', 'status', 'output_url', 'expires_at', 'created_at']));
    expect(columns).not.toContain('*');
    expect(columns).not.toContain('project_data');
    expect(columns).not.toContain('render_config');
  });
});

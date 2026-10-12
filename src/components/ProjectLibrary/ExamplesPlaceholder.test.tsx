import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpcMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: rpcMock } }));

import { useAuthStore } from '@/store/useAuthStore';
import { ExamplesPlaceholder } from './NewProjectModal';

function renderPlaceholder() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExamplesPlaceholder />
    </QueryClientProvider>,
  );
}

describe('ExamplesPlaceholder', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    useAuthStore.setState({ user: null });
  });

  it('signed out: sleepy Mappo, new copy, outline-heart trigger, no request', () => {
    renderPlaceholder();
    expect(screen.getByText('No example projects yet')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'A sleepy Mappo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: "I'd like this, Example projects" })).toBeTruthy();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('signed in and voted: Mappo turns curious and the trigger says "You asked"', async () => {
    useAuthStore.setState({ user: { id: 'u1' } as never });
    rpcMock.mockResolvedValue({
      data: [{ feature_id: 'example-projects', tier: 'few', most_requested: false, has_voted: true }],
      error: null,
    });
    renderPlaceholder();
    await waitFor(() => expect(screen.getByRole('img', { name: 'A curious Mappo' })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'You asked for this, Example projects' }).textContent).toBe('You asked');
  });
});

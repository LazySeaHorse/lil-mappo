import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  posthog: {
    init: vi.fn(), identify: vi.fn(), reset: vi.fn(), register: vi.fn(), capture: vi.fn(),
    setPersonProperties: vi.fn(), stopSessionRecording: vi.fn(), startSessionRecording: vi.fn(),
    sessionRecordingStarted: vi.fn(() => false),
  },
}));

vi.mock('posthog-js/dist/module.full.no-external', () => ({ default: mocks.posthog }));
vi.mock('./config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./config')>()),
  currentAnalyticsRuntime: () => ({ environment: 'production', key: 'phc_test' }),
}));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ isSuccess: false, data: undefined }) }));
vi.mock('@/lib/supabase', () => ({ initialAuthCallbackType: 'signup', supabase: {} }));

import { useAuthStore } from '@/store/useAuthStore';
import { AnalyticsBridge } from './AnalyticsBridge';

describe('signed_up', () => {
  it('fires once after the signup confirmation redirect, carrying the stored attribution', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><AnalyticsBridge /></MemoryRouter>
      </QueryClientProvider>,
    );
    act(() => useAuthStore.setState({
      user: { id: 'u1', email: 'a@b.c', signupAttribution: { utm_source: 'news', ref: 'pal' } },
    }));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const signedUp = mocks.posthog.capture.mock.calls.filter(([event]) => event === 'signed_up');
    expect(signedUp).toEqual([['signed_up', { utm_source: 'news', ref: 'pal' }]]);
    expect(mocks.posthog.setPersonProperties).toHaveBeenCalledWith({}, { initial_utm_source: 'news', initial_ref: 'pal' });

    // A later sign-in in the same page load must not re-fire it.
    act(() => useAuthStore.setState({ user: null }));
    act(() => useAuthStore.setState({ user: { id: 'u1', email: 'a@b.c' } }));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(mocks.posthog.capture.mock.calls.filter(([event]) => event === 'signed_up')).toHaveLength(1);
  });
});

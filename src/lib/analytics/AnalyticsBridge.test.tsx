import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const posthog = {
    init: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    register: vi.fn(),
    capture: vi.fn(),
    setPersonProperties: vi.fn(),
    stopSessionRecording: vi.fn(),
  };
  return { posthog, loaded: vi.fn(), runtime: vi.fn() };
});

vi.mock('posthog-js/dist/module.full.no-external', () => {
  mocks.loaded();
  return { default: mocks.posthog };
});

vi.mock('./config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./config')>()),
  currentAnalyticsRuntime: mocks.runtime,
}));

vi.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ isSuccess: true, data: null }),
}));

import { useAuthStore } from '@/store/useAuthStore';
import { AnalyticsBridge } from './AnalyticsBridge';
import * as client from './client';

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AnalyticsBridge />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const alice = { id: 'user-a', email: 'a@example.com', createdAt: '2026-03-04T10:00:00Z' };

describe('AnalyticsBridge', () => {
  beforeEach(() => {
    client.stop();
    Object.values(mocks.posthog).forEach((fn) => fn.mockClear());
    mocks.runtime.mockReturnValue({ environment: 'preview', key: 'phc_test' });
    useAuthStore.setState({ user: null });
  });

  it('never loads the SDK for signed-out visitors', async () => {
    mount();
    await flush();
    expect(mocks.posthog.init).not.toHaveBeenCalled();
    expect(mocks.posthog.capture).not.toHaveBeenCalled();
  });

  it('starts identified, without email, once a session exists', async () => {
    mount();
    act(() => useAuthStore.setState({ user: alice }));
    await flush();
    expect(mocks.posthog.init).toHaveBeenCalledTimes(1);
    const [key, config] = mocks.posthog.init.mock.calls[0];
    expect(key).toBe('phc_test');
    expect(config).toMatchObject({
      persistence: 'memory',
      bootstrap: { distinctID: 'user-a', isIdentifiedID: true },
      disable_session_recording: true,
      capture_pageview: false,
      mask_all_text: true,
    });
    expect(JSON.stringify(mocks.posthog.init.mock.calls)).not.toContain('a@example.com');
    expect(mocks.posthog.register).toHaveBeenCalledWith(expect.objectContaining({ environment: 'preview', is_mobile: false }));
    expect(mocks.posthog.setPersonProperties).toHaveBeenCalledWith({}, { signed_up_at: '2026-03-04' });
    expect(mocks.posthog.capture).toHaveBeenCalledWith('$pageview', undefined);
  });

  it('resets and stops on sign-out, and drops later events', async () => {
    mount();
    act(() => useAuthStore.setState({ user: alice }));
    await flush();
    act(() => useAuthStore.setState({ user: null }));
    expect(mocks.posthog.stopSessionRecording).toHaveBeenCalled();
    expect(mocks.posthog.reset).toHaveBeenCalledWith(true);
    mocks.posthog.capture.mockClear();
    client.capture('route_added');
    expect(mocks.posthog.capture).not.toHaveBeenCalled();
  });

  it('resets then identifies when a different user signs in', async () => {
    mount();
    act(() => useAuthStore.setState({ user: alice }));
    await flush();
    act(() => useAuthStore.setState({ user: { id: 'user-b', email: 'b@example.com' } }));
    await flush();
    expect(mocks.posthog.reset).toHaveBeenCalled();
    expect(mocks.posthog.identify).toHaveBeenCalledWith('user-b');
  });

  it('does nothing when analytics is disabled', async () => {
    mocks.runtime.mockReturnValue(null);
    mount();
    act(() => useAuthStore.setState({ user: alice }));
    await flush();
    expect(mocks.posthog.init).not.toHaveBeenCalled();
  });
});

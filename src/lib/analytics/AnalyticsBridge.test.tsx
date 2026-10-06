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
    startSessionRecording: vi.fn(),
    sessionRecordingStarted: vi.fn(() => false),
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

import { useProjectStore } from '@/store/useProjectStore';
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
    mocks.posthog.sessionRecordingStarted.mockReturnValue(false);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
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
      session_recording: { maskAllInputs: true, maskTextSelector: '*', blockSelector: '.mapboxgl-map' },
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

  describe('session replay', () => {
    const signIn = async () => {
      mount();
      act(() => useAuthStore.setState({ user: alice }));
      await flush();
    };

    it('samples signed-in sessions with the single REPLAY_SAMPLE_RATE constant', async () => {
      await signIn();
      expect(mocks.posthog.startSessionRecording).not.toHaveBeenCalled();
      client.stop();
      vi.mocked(Math.random).mockReturnValue(0.1);
      act(() => useAuthStore.setState({ user: null }));
      act(() => useAuthStore.setState({ user: { ...alice, id: 'user-c' } }));
      await flush();
      expect(mocks.posthog.startSessionRecording).toHaveBeenCalledWith(true);
    });

    it('forces replay on $exception and upgrade prompts, once', async () => {
      await signIn();
      client.forceReplay('error');
      expect(mocks.posthog.startSessionRecording).toHaveBeenCalledTimes(1);
      mocks.posthog.sessionRecordingStarted.mockReturnValue(true);
      client.forceReplay('upgrade_gate');
      expect(mocks.posthog.startSessionRecording).toHaveBeenCalledTimes(1);
    });

    it('pauses during export and resumes only if it was recording', async () => {
      await signIn();
      mocks.posthog.sessionRecordingStarted.mockReturnValue(true);
      act(() => useProjectStore.setState({ isExporting: true }));
      expect(mocks.posthog.stopSessionRecording).toHaveBeenCalledTimes(1);
      client.forceReplay('error'); // ignored while paused
      expect(mocks.posthog.startSessionRecording).not.toHaveBeenCalled();
      act(() => useProjectStore.setState({ isExporting: false }));
      expect(mocks.posthog.startSessionRecording).toHaveBeenCalledWith(true);
    });

    it('does not resume after export when it was not recording', async () => {
      await signIn();
      act(() => useProjectStore.setState({ isExporting: true }));
      act(() => useProjectStore.setState({ isExporting: false }));
      expect(mocks.posthog.stopSessionRecording).not.toHaveBeenCalled();
      expect(mocks.posthog.startSessionRecording).not.toHaveBeenCalled();
    });
  });
});

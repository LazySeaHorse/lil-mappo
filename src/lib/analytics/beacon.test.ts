import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => vi.fn());
const posthog = vi.hoisted(() => ({
  init: vi.fn(), identify: vi.fn(), reset: vi.fn(), register: vi.fn(), capture: vi.fn(),
  setPersonProperties: vi.fn(), stopSessionRecording: vi.fn(), startSessionRecording: vi.fn(),
  sessionRecordingStarted: vi.fn(() => false),
}));
vi.mock('posthog-js/dist/module.full.no-external', () => ({ default: posthog }));
vi.mock('./config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./config')>()),
  currentAnalyticsRuntime: runtime,
}));

import * as client from './client';
import { trackBeacon } from './index';

describe('trackBeacon (checkout_started)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    runtime.mockReturnValue({ environment: 'preview', key: 'phc_test' });
  });
  afterEach(() => {
    client.stop();
    vi.unstubAllGlobals();
  });

  it('sends immediately as a keepalive POST for the identified user, without waiting for the SDK chunk', () => {
    client.start({ userId: 'user-1' }); // SDK import still pending
    trackBeacon('checkout_started', { plan: 'wanderer', resumed: true });
    expect(posthog.capture).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/_m/i/v0/e/');
    expect(init).toMatchObject({ method: 'POST', keepalive: true, credentials: 'omit' });
    expect(JSON.parse(init.body)).toMatchObject({
      api_key: 'phc_test',
      event: 'checkout_started',
      distinct_id: 'user-1',
      properties: { plan: 'wanderer', resumed: true, environment: 'preview' },
    });
    expect(JSON.parse(init.body).properties).not.toHaveProperty('$process_person_profile');
  });

  it('does nothing when signed out', () => {
    trackBeacon('checkout_started', { plan: 'wanderer', resumed: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when analytics is disabled', () => {
    client.start({ userId: 'user-1' });
    runtime.mockReturnValue(null);
    trackBeacon('checkout_started', { plan: 'wanderer', resumed: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

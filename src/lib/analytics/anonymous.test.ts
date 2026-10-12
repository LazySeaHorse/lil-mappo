import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => vi.fn());
vi.mock('./config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./config')>()),
  currentAnalyticsRuntime: runtime,
}));

import { trackAnonymous } from './anonymous';

describe('trackAnonymous', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    runtime.mockReturnValue({ environment: 'preview', key: 'phc_test' });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('posts one profile-less event through the first-party proxy', () => {
    trackAnonymous('signin_failed', { error_class: 'invalid_credentials' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/_m/i/v0/e/');
    expect(init).toMatchObject({ method: 'POST', keepalive: true, credentials: 'omit' });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      api_key: 'phc_test',
      event: 'signin_failed',
      properties: { error_class: 'invalid_credentials', $process_person_profile: false, environment: 'preview' },
    });
    expect(typeof body.distinct_id).toBe('string');
  });

  it('uses a fresh distinct id per event', () => {
    trackAnonymous('guest_gate_hit', { where: 'sign_in' });
    trackAnonymous('guest_gate_hit', { where: 'sign_in' });
    const ids = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).distinct_id);
    expect(new Set(ids).size).toBe(2);
  });

  it('does nothing when analytics is disabled', () => {
    runtime.mockReturnValue(null);
    trackAnonymous('guest_gate_hit', { where: 'map_load' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows network failures', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(() => trackAnonymous('guest_route_added', { source: 'car' })).not.toThrow();
    await Promise.resolve();
  });
});

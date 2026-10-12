/**
 * The production gates, exercised end to end with the real resolver and the
 * real entry points: build flags come from import.meta.env (vi.stubEnv), the
 * page from jsdom's location / navigator. Each gate is flipped on its own from
 * a fully enabled baseline, so a passing "disabled" case cannot be vacuous.
 * (The Playwright smoke can only prove the dev build is silent, because dev
 * has no key and the host is unlisted; it cannot cover these.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const posthog = vi.hoisted(() => ({
  loaded: vi.fn(),
  api: {
    init: vi.fn(), identify: vi.fn(), reset: vi.fn(), register: vi.fn(), capture: vi.fn(),
    setPersonProperties: vi.fn(), stopSessionRecording: vi.fn(), startSessionRecording: vi.fn(),
    sessionRecordingStarted: vi.fn(() => false),
  },
}));
vi.mock('posthog-js/dist/module.full.no-external', () => {
  posthog.loaded();
  return { default: posthog.api };
});

import { currentAnalyticsRuntime } from './config';
import { trackAnonymous } from './anonymous';
import * as client from './client';
import { trackBeacon } from './index';

function setPage(url: string, webdriver = false) {
  window.history.pushState({}, '', url);
  Object.defineProperty(window.navigator, 'webdriver', { configurable: true, value: webdriver });
}

/** jsdom's origin is fixed (localhost), so the allow-listed host is injected via location. */
function stubHost(hostname: string, search = '') {
  const real = window.location;
  vi.spyOn(window, 'location', 'get').mockReturnValue({ ...real, hostname, search, origin: `https://${hostname}` } as Location);
}

const fetchMock = vi.fn();

describe('analytics gates (real resolver, real entry points)', () => {
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    setPage('/');
    stubHost('app.lilmappo.tech');
    Object.values(posthog.api).forEach((fn) => fn.mockClear());
    posthog.loaded.mockClear();
  });
  afterEach(() => {
    client.stop();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function exercise() {
    trackAnonymous('guest_gate_hit', { where: 'sign_in' });
    client.start({ userId: 'u1' });
    trackBeacon('checkout_started', { plan: 'wanderer', resumed: false });
    await new Promise((r) => setTimeout(r, 0));
  }

  it('baseline: production build, key, allow-listed host, human browser is enabled', async () => {
    expect(currentAnalyticsRuntime()).toEqual({ environment: 'production', key: 'phc_test' });
    await exercise();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(posthog.loaded).toHaveBeenCalled();
    expect(posthog.api.init).toHaveBeenCalled();
  });

  it('preview host reports the preview environment', () => {
    stubHost('preview.lilmappo.tech');
    expect(currentAnalyticsRuntime()?.environment).toBe('preview');
  });

  it.each<[string, () => void]>([
    ['no key', () => vi.stubEnv('VITE_POSTHOG_KEY', '')],
    ['a blank key', () => vi.stubEnv('VITE_POSTHOG_KEY', '   ')],
    ['a dev build', () => vi.stubEnv('PROD', false)],
    ['an automated browser (navigator.webdriver)', () => setPage('/', true)],
    ['an unknown host', () => stubHost('localhost')],
    ['a Vercel branch deployment', () => stubHost('lil-mappo-git-x.vercel.app')],
    ['render mode (?render_job=)', () => stubHost('app.lilmappo.tech', '?render_job=abc')],
  ])('is a total no-op with %s', async (_name, breakIt) => {
    breakIt();
    expect(currentAnalyticsRuntime()).toBeNull();
    await exercise();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(posthog.loaded).not.toHaveBeenCalled();
    expect(client.isActive()).toBe(false);
  });
});

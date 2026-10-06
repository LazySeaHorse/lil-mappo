import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => vi.fn());
vi.mock('./config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./config')>()),
  currentAnalyticsRuntime: runtime,
}));

import { captureLandingAttribution, getSignupAttribution } from './attribution';

describe('landing attribution', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    runtime.mockReturnValue({ environment: 'production', key: 'phc_test' });
  });

  it('stores sanitized values, strips utm params and keeps other params', () => {
    window.history.replaceState(null, '', '/?utm_source=news&utm_medium=em%20ail&ref=friend&checkout=success&utm_campaign=a<b#x');
    captureLandingAttribution();
    expect(getSignupAttribution()).toEqual({ utm_source: 'news', ref: 'friend' });
    expect(window.location.search).toBe('?checkout=success');
    expect(window.location.hash).toBe('#x');
  });

  it('keeps the first touch within a tab', () => {
    window.history.replaceState(null, '', '/?utm_source=first');
    captureLandingAttribution();
    window.history.replaceState(null, '', '/?utm_source=second');
    captureLandingAttribution();
    expect(getSignupAttribution()).toEqual({ utm_source: 'first' });
  });

  it('is a complete no-op when analytics is disabled', () => {
    runtime.mockReturnValue(null);
    window.history.replaceState(null, '', '/?utm_source=news');
    captureLandingAttribution();
    expect(window.location.search).toBe('?utm_source=news');
    expect(getSignupAttribution()).toEqual({});
    expect(window.sessionStorage.length).toBe(0);
  });
});

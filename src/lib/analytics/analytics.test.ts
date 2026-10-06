import { describe, expect, it, vi } from 'vitest';
import { resolveAnalyticsEnvironment } from './config';
import { bucketCount, bucketDuration, bucketPointCount, type AnalyticsEventMap } from './events';
import { maskReplayText, sanitizeAttribution, sanitizeUrl, scrubEvent } from './privacy';
import { track } from './index';

const prodHost = { hostname: 'app.lilmappo.tech', search: '' };
const human = { webdriver: false };
const on = { prod: true, key: 'phc_test' };

describe('resolveAnalyticsEnvironment', () => {
  it('enables production and preview hosts', () => {
    expect(resolveAnalyticsEnvironment(prodHost, human, on)).toEqual({ environment: 'production', key: 'phc_test' });
    expect(resolveAnalyticsEnvironment({ hostname: 'preview.lilmappo.tech', search: '' }, human, on)?.environment).toBe('preview');
  });

  it.each([
    ['no key', prodHost, human, { prod: true, key: '' }],
    ['dev build', prodHost, human, { prod: false, key: 'phc_test' }],
    ['webdriver', prodHost, { webdriver: true }, on],
    ['unknown host', { hostname: 'localhost', search: '' }, human, on],
    ['branch deployment', { hostname: 'lil-mappo-git-x.vercel.app', search: '' }, human, on],
    ['render mode', { hostname: 'app.lilmappo.tech', search: '?render_job=abc' }, human, on],
  ])('is disabled for %s', (_name, location, nav, input) => {
    expect(resolveAnalyticsEnvironment(location, nav, input)).toBeNull();
  });

  it('is disabled under vitest by default (not a production build)', () => {
    expect(resolveAnalyticsEnvironment(prodHost, human)).toBeNull();
  });
});

describe('sanitizeUrl', () => {
  const origin = 'https://app.lilmappo.tech';

  it('drops query strings and hashes', () => {
    expect(sanitizeUrl(`${origin}/?email=a%40b.c&render_secret=x#token=1`, origin)).toBe(`${origin}/`);
  });

  it('templates route slugs', () => {
    expect(sanitizeUrl(`${origin}/routes/lhr-jfk?x=1`, origin)).toBe(`${origin}/routes/:slug`);
    expect(sanitizeUrl('/routes/lhr-jfk?x=1', origin)).toBe('/routes/:slug');
  });

  it('keeps only the origin of foreign referrers', () => {
    expect(sanitizeUrl('https://checkout.dodopayments.com/session/abc?x=1', origin)).toBe('https://checkout.dodopayments.com');
  });

  it('passes $direct and drops garbage', () => {
    expect(sanitizeUrl('$direct', origin)).toBe('$direct');
    expect(sanitizeUrl('not a url', origin)).toBeUndefined();
    expect(sanitizeUrl('javascript:alert(1)', origin)).toBeUndefined();
    expect(sanitizeUrl(undefined, origin)).toBeUndefined();
  });
});

describe('scrubEvent', () => {
  it('rewrites URL properties and exception frames, and passes null through', () => {
    const origin = window.location.origin;
    const event = {
      properties: {
        $current_url: `${origin}/routes/secret?render_secret=1`,
        $pathname: '/routes/secret',
        $referrer: 'https://example.com/a?b=c',
        $exception_list: [{ stacktrace: { frames: [{ filename: `${origin}/assets/a.js?v=1` }] } }],
        keep: 'me',
      },
    };
    const out = scrubEvent(event)!;
    expect(out.properties.$current_url).toBe(`${origin}/routes/:slug`);
    expect(out.properties.$pathname).toBe('/routes/:slug');
    expect(out.properties.$referrer).toBe('https://example.com');
    expect(out.properties.$exception_list[0].stacktrace.frames[0].filename).toBe(`${origin}/assets/a.js`);
    expect(out.properties.keep).toBe('me');
    expect(scrubEvent(null)).toBeNull();
  });
});

describe('sanitizeAttribution', () => {
  it('keeps whitelisted, well-formed values only', () => {
    expect(
      sanitizeAttribution({ utm_source: 'news-letter', utm_medium: 'a b', utm_campaign: 'x'.repeat(65), ref: 'friend_1', other: 'x' }),
    ).toEqual({ utm_source: 'news-letter', ref: 'friend_1' });
    expect(sanitizeAttribution(null)).toEqual({});
  });
});

describe('buckets', () => {
  it('buckets point counts', () => {
    expect([2, 10, 11, 100, 101, 1000, 1001, 10000, 10001].map(bucketPointCount)).toEqual([
      '2-10', '2-10', '11-100', '11-100', '101-1k', '101-1k', '1k-10k', '1k-10k', '10k+',
    ]);
  });
  it('buckets durations and counts', () => {
    expect([5, 10, 45, 120, 600].map(bucketDuration)).toEqual(['<10s', '10-30s', '30-60s', '1-3m', '3m+']);
    expect([0, 1, 3, 10, 50].map(bucketCount)).toEqual(['0', '1', '2-5', '6-20', '21+']);
  });
});

describe('track', () => {
  it('is a silent no-op without a started client and never imports the SDK', () => {
    expect(() => track('autocam_enabled')).not.toThrow();
    expect(() => track('feature_voted', { feature_id: 'cloud-render' })).not.toThrow();
  });

  it('rejects unknown events and wrong props at compile time', () => {
    const noop = vi.fn();
    noop(() => {
      // @ts-expect-error unknown event name
      track('not_an_event');
      // @ts-expect-error missing required props
      track('feature_voted');
    });
    const keys: Array<keyof AnalyticsEventMap> = ['feature_preview_opened', 'feature_voted', 'feature_unvoted'];
    expect(keys).toHaveLength(3);
  });
});

describe('maskReplayText', () => {
  it('masks by default and keeps text only inside [data-ph-unmask]', () => {
    document.body.innerHTML = '<div data-ph-unmask><button id="a">Export</button></div><p id="b">My trip to Paris</p>';
    expect(maskReplayText('Export', document.getElementById('a'))).toBe('Export');
    const masked = maskReplayText('My trip', document.getElementById('b'));
    expect(masked).toBe('\u2022\u2022 \u2022\u2022\u2022\u2022');
    expect(maskReplayText('x', undefined)).toBe('\u2022');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { resolveAnalyticsEnvironment } from './config';
import { bucketCount, bucketDuration, bucketPointCount, type AnalyticsEventMap } from './events';
import { buildInitConfig } from './client';
import { maskReplayAttribute, maskReplayText, maskReplayUrlRequest, sanitizeAttribution, sanitizeExceptionText, sanitizeUrl, scrubEvent } from './privacy';
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

describe('scrubEvent (SDK property families)', () => {
  it('drops the page title (free text such as a project name)', () => {
    const out = scrubEvent({ properties: { title: "Grandma's trip", $title: 'Elm St', $pathname: '/' }, $set: { $title: 'x' } })!;
    expect(out.properties).toEqual({ $pathname: '/' });
    expect(out.$set).toEqual({});
  });

  const origin = window.location.origin;

  it('scrubs every url-like key by name, in properties, $set and $set_once', () => {
    const event = {
      properties: {
        $session_entry_url: `${origin}/routes/secret?email=a%40b.c`,
        $session_entry_pathname: '/routes/secret',
        $session_entry_referrer: 'https://google.com/search?q=steven+grey',
        $prev_pageview_pathname: '/routes/secret',
        $set_once: { $initial_referrer: 'https://google.com/search?q=x', $initial_current_url: `${origin}/routes/s?x=1` },
      },
      $set: { $current_url: `${origin}/routes/s?x=1` },
    };
    const out = scrubEvent(event)!;
    expect(out.properties.$session_entry_url).toBe(`${origin}/routes/:slug`);
    expect(out.properties.$session_entry_pathname).toBe('/routes/:slug');
    expect(out.properties.$session_entry_referrer).toBe('https://google.com');
    expect(out.properties.$prev_pageview_pathname).toBe('/routes/:slug');
    expect(out.properties.$set_once.$initial_referrer).toBe('https://google.com');
    expect(out.properties.$set_once.$initial_current_url).toBe(`${origin}/routes/:slug`);
    expect(out.$set.$current_url).toBe(`${origin}/routes/:slug`);
  });

  it('drops search terms, search engines and click ids, and only keeps well-formed utm values', () => {
    const out = scrubEvent({
      properties: {
        ph_keyword: 'steven grey',
        $session_entry_ph_keyword: 'x',
        $search_engine: 'google',
        $session_entry_search_engine: 'google',
        $gclid: 'abc',
        utm_source: 'news-letter',
        $session_entry_utm_term: 'steven grey',
        source: 'car',
        $set_once: { $initial_ph_keyword: 'x', $initial_search_engine: 'bing' },
      },
    })!;
    expect(out.properties).toEqual({ utm_source: 'news-letter', source: 'car', $set_once: {} });
  });

  it('cleans exception messages', () => {
    const out = scrubEvent({
      properties: {
        $exception_list: [{ type: 'Error', value: 'Failed to load https://x.test/img/Grandma.png?sig=1' }],
        $exception_message: 'Bad "user text"',
      },
    })!;
    expect(out.properties.$exception_list[0].value).toBe('Failed to load <url>');
    expect(out.properties.$exception_message).toBe('Bad ""');
  });
});

describe('sanitizeExceptionText', () => {
  it('removes quoted JSON snippets and keeps contractions and property names', () => {
    expect(sanitizeExceptionText(`Unexpected token 'h', "hello world" is not valid JSON`)).toBe(`Unexpected token '', "" is not valid JSON`);
    expect(sanitizeExceptionText("Can't read properties of undefined (reading 'lat')")).toBe("Can't read properties of undefined (reading '')");
  });
  it('removes image sources and truncates', () => {
    expect(sanitizeExceptionText('Image error src=https://cdn.test/me.png?x=1 end')).toBe('Image error src=<url> end');
    expect(sanitizeExceptionText('x'.repeat(500))!.length).toBe(203);
    expect(sanitizeExceptionText(undefined)).toBeUndefined();
  });
  it('removes email addresses and bare user file names', () => {
    expect(sanitizeExceptionText('Invalid email a@b.com')).toBe('Invalid email <email>');
    expect(sanitizeExceptionText('Failed to parse trip-to-grandma.gpx')).toBe('Failed to parse <file>');
    expect(sanitizeExceptionText('Cannot read my.route.v2.GeoJSON: bad; also cover.PNG and clip.mp4')).toBe('Cannot read <file>: bad; also <file> and <file>');
    expect(sanitizeExceptionText('Unexpected end of JSON input')).toBe('Unexpected end of JSON input');
  });
});

describe('replay masking hooks', () => {
  it('bullets text-carrying attributes and keeps layout ones', () => {
    expect(maskReplayAttribute('aria-label', 'Route 12 Elm')).toBe('\u2022\u2022\u2022\u2022\u2022 \u2022\u2022 \u2022\u2022\u2022');
    expect(maskReplayAttribute('data-id', 'ab')).toBe('\u2022\u2022');
    expect(maskReplayAttribute('class', 'flex gap-2')).toBe('flex gap-2');
  });
  it('reduces request and page URLs, dropping unusable ones', () => {
    expect(maskReplayUrlRequest({ name: `${window.location.origin}/routes/abc?email=a%40b.c` })).toEqual({ name: `${window.location.origin}/routes/:slug` });
    expect(maskReplayUrlRequest({ name: 'blob:xyz' })).toBeNull();
  });
});

describe('production SDK config', () => {
  it('pins capture channels that remote config could otherwise enable', () => {
    const cfg = buildInitConfig('u', () => null);
    expect(cfg).toMatchObject({
      capture_performance: false,
      enable_recording_console_log: false,
      mask_all_element_attributes: true,
      mask_all_text: true,
      persistence: 'memory',
      save_campaign_params: false,
    });
    expect(cfg.session_recording).toMatchObject({ maskAllInputs: true, maskTextSelector: '*' });
    expect(cfg.session_recording?.maskCapturedNetworkRequestFn).toBe(maskReplayUrlRequest);
    expect(cfg.session_recording?.maskAttributeFn).toBe(maskReplayAttribute);
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

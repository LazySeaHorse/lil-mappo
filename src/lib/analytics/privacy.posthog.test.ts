/**
 * Drives the REAL posthog-js (jsdom) with the production init config and the
 * repo's own scrubEvent, then deep-scans every captured payload. The mocked-SDK
 * tests elsewhere cannot notice properties the SDK adds on its own
 * ($session_entry_*, $set_once search terms, element attributes...).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PostHog } from 'posthog-js/dist/module.full.no-external';
import { buildInitConfig } from './client';
import { scrubEvent } from './privacy';

const SECRETS = ['secret-slug', 'a%40b.com', 'a@b.com', 'email=', 'steven', 'grey', 'q=', 'search?', 'Grandma', 'Elm St', 'secret-cta', '#x'];

/** Request bodies are `data=<base64 json>` (or plain JSON); returns the decoded text plus the raw body. */
function decodeBody(body: string): string {
  const raw = body.startsWith('data=') ? decodeURIComponent(body.slice(5)) : body;
  try {
    return `${body}\n${Buffer.from(raw, 'base64').toString('utf8')}`;
  } catch {
    return body;
  }
}

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      strings(v, out);
    }
  }
  return out;
}

describe('real posthog-js with the production config', () => {
  const captured: Array<{ event: string; properties: Record<string, unknown> }> = [];
  /** Every request the SDK actually sent (fetch and XHR), URL plus raw body. */
  const requests: Array<{ url: string; body: string }> = [];
  let posthog: PostHog;

  beforeAll(async () => {
    window.history.pushState({}, '', '/routes/secret-slug?email=a%40b.com&utm_term=steven+grey#x');
    Object.defineProperty(document, 'referrer', { configurable: true, value: 'https://www.google.com/search?q=steven+grey&hl=en' });
    // Remote config deliberately omits `hasFeatureFlags`, so the SDK would load feature flags by default.
    const respond = (url: string) => (url.includes('/array/') ? JSON.stringify({ autocapture_opt_out: false }) : '{}');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        requests.push({ url, body: typeof init?.body === 'string' ? init.body : '' });
        return new Response(respond(url), { status: 200 });
      }),
    );
    class FakeXhr {
      status = 200;
      responseText = '{}';
      readyState = 4;
      url = '';
      onreadystatechange: (() => void) | null = null;
      open(_method: string, url: string) {
        this.url = url;
      }
      setRequestHeader() {}
      send(body?: unknown) {
        requests.push({ url: this.url, body: typeof body === 'string' ? body : '' });
        this.responseText = respond(this.url);
        setTimeout(() => this.onreadystatechange?.(), 0);
      }
    }
    //XX
    document.body.innerHTML =
      '<div title="Grandma\'s house trip" aria-label="Route: 12 Elm St"><button id="b" data-attr="secret-cta" title="Grandma">Delete</button></div>';
    const mod = await import('posthog-js/dist/module.full.no-external');
    posthog = mod.default;
    posthog.init('phc_test', {
      ...buildInitConfig('user-1', () => null),
      before_send: [
        (e) => scrubEvent(e),
        (e) => {
          captured.push(JSON.parse(JSON.stringify(e)));
          return e; // sent to the stubbed fetch/XHR only, so the real request bodies can be scanned
        },
      ],
      disable_session_recording: true,
      // Send each event immediately so the test does not wait for the 3s batch timer.
      request_batching: false,
    });
    // Autocapture starts once remote config has answered (as in production).
    await new Promise((r) => setTimeout(r, 300));
    posthog.capture('$pageview');
    // The bridge sets person properties after the first pageview; with flags enabled this reloads flags with the $initial_* props.
    posthog.setPersonProperties({ plan: 'free' }, { signed_up_at: '2026-01-01' });
    document.getElementById('b')!.click();
    posthog.capture('route_added', { source: 'car', point_bucket: '2-10' });
    posthog.captureException(new Error('Unexpected token \'h\', "hello grey" is not valid JSON at https://app.lilmappo.tech/routes/secret-slug?email=a%40b.com'));
    await new Promise((r) => setTimeout(r, 1500));
  });

  afterAll(() => {
    posthog.reset();
    vi.unstubAllGlobals();
  });

  it('captured the events under test', () => {
    const names = captured.map((e) => e.event);
    expect(names).toContain('$pageview');
    expect(names).toContain('$autocapture');
    expect(names).toContain('$exception');
    expect(names).toContain('route_added');
  });

  it('never carries the slug, query, referrer path, search terms or element attributes anywhere', () => {
    const all = strings(captured);
    for (const secret of SECRETS) {
      const hit = all.find((s) => s.toLowerCase().includes(secret.toLowerCase()));
      expect(hit, `leaked "${secret}" in: ${hit}`).toBeUndefined();
    }
  });

  it('never puts the slug, query, referrer path or search terms in ANY outgoing request body', () => {
    expect(requests.length).toBeGreaterThan(0);
    const bodies = requests.map(({ body }) => decodeBody(body));
    // At least one body must be the event batch, otherwise this scan proves nothing.
    expect(bodies.some((b) => b.includes('route_added'))).toBe(true);
    for (const secret of SECRETS) {
      const hit = requests.find(({ url, body }) => `${url} ${decodeBody(body)}`.toLowerCase().includes(secret.toLowerCase()));
      expect(hit, `leaked "${secret}" in request ${hit?.url}: ${hit?.body.slice(0, 300)}`).toBeUndefined();
    }
  });

  it('makes no feature-flags request even when remote config does not disable flags', () => {
    expect(requests.map(({ url }) => url).filter((url) => /\/flags\b|\/decide\b/.test(url))).toEqual([]);
  });

  it('keeps the useful, scrubbed values', () => {
    const view = captured.find((e) => e.event === '$pageview')!;
    expect(view.properties.$current_url).toBe(`${window.location.origin}/routes/:slug`);
    expect(view.properties.$referrer).toBe('https://www.google.com');
    expect(view.properties.$session_entry_url).toBe(`${window.location.origin}/routes/:slug`);
    expect(captured.find((e) => e.event === 'route_added')!.properties.source).toBe('car');
  });
});

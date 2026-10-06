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
  let posthog: PostHog;

  beforeAll(async () => {
    window.history.pushState({}, '', '/routes/secret-slug?email=a%40b.com&utm_term=steven+grey#x');
    Object.defineProperty(document, 'referrer', { configurable: true, value: 'https://www.google.com/search?q=steven+grey&hl=en' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
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
          return null; // nothing leaves the test
        },
      ],
      advanced_disable_flags: true,
      disable_session_recording: true,
    });
    posthog.capture('$pageview');
    document.getElementById('b')!.click();
    posthog.capture('route_added', { source: 'car', point_bucket: '2-10' });
    posthog.captureException(new Error('Unexpected token \'h\', "hello grey" is not valid JSON at https://app.lilmappo.tech/routes/secret-slug?email=a%40b.com'));
    await new Promise((r) => setTimeout(r, 200));
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

  it('keeps the useful, scrubbed values', () => {
    const view = captured.find((e) => e.event === '$pageview')!;
    expect(view.properties.$current_url).toBe(`${window.location.origin}/routes/:slug`);
    expect(view.properties.$referrer).toBe('https://www.google.com');
    expect(view.properties.$session_entry_url).toBe(`${window.location.origin}/routes/:slug`);
    expect(captured.find((e) => e.event === 'route_added')!.properties.source).toBe('car');
  });
});

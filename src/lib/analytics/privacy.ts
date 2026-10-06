/**
 * Privacy helpers applied to every outgoing event (`before_send`) and to
 * attribution values before they are stored or sent.
 */
import type { AttributionProps } from './events';

const SLUG_PATH = /^\/routes\/[^/]+/;

/** Rewrites app paths that embed user-chosen ids into a stable template. */
function templatePath(pathname: string): string {
  return pathname.replace(SLUG_PATH, '/routes/:slug');
}

/**
 * Reduces a URL to `origin + templated path`. The query string and hash are
 * always dropped (checkout return URLs carry `email=`, render mode carries
 * `render_job`/`render_secret`). Third-party URLs (referrers) keep only their
 * origin. Non-URL marker values such as `$direct` pass through; anything
 * unparseable is dropped (returns undefined).
 */
export function sanitizeUrl(raw: unknown, ownOrigin?: string): string | undefined {
  if (typeof raw !== 'string' || raw === '') return undefined;
  if (raw.startsWith('$')) return raw;
  if (raw.startsWith('/')) return templatePath(raw.split(/[?#]/)[0]);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  const own = ownOrigin ?? (typeof window !== 'undefined' ? window.location.origin : undefined);
  if (own && url.origin !== own) return url.origin;
  return url.origin + templatePath(url.pathname);
}

const ATTRIBUTION_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref'] as const;
const ATTRIBUTION_VALUE = /^[A-Za-z0-9._-]{1,64}$/;

/** Keeps only whitelisted keys whose values match `[A-Za-z0-9._-]{1,64}`. Attribution only, never trusted. */
export function sanitizeAttribution(input: unknown): AttributionProps {
  const out: AttributionProps = {};
  if (!input || typeof input !== 'object') return out;
  const source = input as Record<string, unknown>;
  for (const key of ATTRIBUTION_KEYS) {
    const value = source[key];
    if (typeof value === 'string' && ATTRIBUTION_VALUE.test(value)) out[key] = value;
  }
  return out;
}

const URL_PROPS = [
  '$current_url',
  '$pathname',
  '$referrer',
  '$initial_current_url',
  '$initial_pathname',
  '$initial_referrer',
  '$exception_source',
  '$prev_pageview_pathname',
] as const;

interface ExceptionFrame {
  filename?: unknown;
  [key: string]: unknown;
}

function scrubExceptionList(list: unknown): void {
  if (!Array.isArray(list)) return;
  for (const entry of list) {
    const frames = (entry as { stacktrace?: { frames?: ExceptionFrame[] } } | null)?.stacktrace?.frames;
    if (!Array.isArray(frames)) continue;
    for (const frame of frames) {
      if (typeof frame.filename === 'string') {
        const clean = sanitizeUrl(frame.filename);
        if (clean) frame.filename = clean;
        else delete frame.filename;
      }
    }
  }
}

function scrubUrlBag(bag: Record<string, unknown> | undefined): void {
  if (!bag) return;
  for (const key of URL_PROPS) {
    if (!(key in bag)) continue;
    const clean = sanitizeUrl(bag[key]);
    if (clean === undefined) delete bag[key];
    else bag[key] = clean;
  }
}

interface ScrubbableEvent {
  properties?: Record<string, unknown>;
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
}

/** `before_send` implementation: URL scrubbing on properties, `$set`, `$set_once` and exception frames. */
export function scrubEvent<T extends ScrubbableEvent>(event: T | null): T | null {
  if (!event) return null;
  scrubUrlBag(event.properties);
  scrubUrlBag(event.properties?.$set as Record<string, unknown> | undefined);
  scrubUrlBag(event.properties?.$set_once as Record<string, unknown> | undefined);
  scrubUrlBag(event.$set);
  scrubUrlBag(event.$set_once);
  scrubExceptionList(event.properties?.$exception_list);
  return event;
}

/**
 * Session-replay `maskTextFn`: text stays readable only inside a
 * `[data-ph-unmask]` region (static app chrome). Everything else, including all
 * user content, is replaced by bullets of the same length.
 */
export function maskReplayText(text: string, element?: Element | null): string {
  if (element?.closest?.('[data-ph-unmask]') && !element.closest('.ph-no-capture')) return text;
  return text.replace(/\S/g, '\u2022');
}

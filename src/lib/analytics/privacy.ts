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

/**
 * Any property that holds a URL or path. Matched by name (not a fixed list) so
 * the SDK's own families are covered: `$current_url`, `$pathname`,
 * `$referrer`, `$session_entry_url`, `$initial_current_url`,
 * `$prev_pageview_pathname`, `$exception_source`, ...
 */
const URL_KEY = /(url|pathname|referrer|href|exception_source)$/i;
/** Search terms and search engine of the referring page (`ph_keyword`, `$initial_ph_keyword`, `$session_entry_search_engine`, ...). */
const SEARCH_KEY = /(ph_keyword|search_engine)$/i;
/** Campaign params the SDK copies from the URL into `$session_entry_*` / `$initial_*` props. Same trust rule as sanitizeAttribution. */
const UTM_KEY = /(^|_)utm_[a-z]+$/i;
/** Ad-network click ids: opaque per-user tokens, never needed. */
const CLICK_ID_KEY = /(gclid|gbraid|wbraid|fbclid|msclkid|dclid|twclid|ttclid|li_fat_id|igshid|rdt_cid|epik|gad_source|gad_campaignid)$/i;
/** Free-text exception fields. */
const EXCEPTION_TEXT_KEY = /^\$exception_(message|values?)$/i;

const MAX_EXCEPTION_TEXT = 200;

/**
 * Makes an exception message safe to send: URLs and quoted substrings (which
 * is where parser errors, selectors, file names and user text end up) are
 * removed and the result is truncated.
 */
export function sanitizeExceptionText(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const clean = raw
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S*/gi, '<url>')
    .replace(/"[^"]*"|`[^`]*`/g, '""')
    // Single quotes only when they open a quoted span, so "Can't read property" survives.
    .replace(/(^|[^\w])'[^']*'(?!\w)/g, "$1''");
  return clean.length > MAX_EXCEPTION_TEXT ? `${clean.slice(0, MAX_EXCEPTION_TEXT)}...` : clean;
}

interface ExceptionFrame {
  filename?: unknown;
  [key: string]: unknown;
}

function scrubExceptionList(list: unknown): void {
  if (!Array.isArray(list)) return;
  for (const entry of list) {
    if (entry && typeof entry === 'object') {
      const text = entry as { value?: unknown; type?: unknown };
      if ('value' in text) {
        const clean = sanitizeExceptionText(text.value);
        if (clean === undefined) delete text.value;
        else text.value = clean;
      }
    }
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

function scrubBag(bag: Record<string, unknown> | undefined): void {
  if (!bag) return;
  for (const key of Object.keys(bag)) {
    if (SEARCH_KEY.test(key) || CLICK_ID_KEY.test(key)) {
      delete bag[key];
    } else if (UTM_KEY.test(key)) {
      const value = bag[key];
      if (typeof value !== 'string' || !ATTRIBUTION_VALUE.test(value)) delete bag[key];
    } else if (URL_KEY.test(key)) {
      const clean = sanitizeUrl(bag[key]);
      if (clean === undefined) delete bag[key];
      else bag[key] = clean;
    } else if (EXCEPTION_TEXT_KEY.test(key)) {
      const value = bag[key];
      if (Array.isArray(value)) bag[key] = value.map((v) => sanitizeExceptionText(v) ?? '');
      else {
        const clean = sanitizeExceptionText(value);
        if (clean === undefined) delete bag[key];
        else bag[key] = clean;
      }
    }
  }
}

interface ScrubbableEvent {
  properties?: Record<string, unknown>;
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
}

/** `before_send` implementation: URL, search-term and exception-text scrubbing on properties, `$set`, `$set_once` and exception frames. */
export function scrubEvent<T extends ScrubbableEvent>(event: T | null): T | null {
  if (!event) return null;
  scrubBag(event.properties);
  scrubBag(event.properties?.$set as Record<string, unknown> | undefined);
  scrubBag(event.properties?.$set_once as Record<string, unknown> | undefined);
  scrubBag(event.$set);
  scrubBag(event.$set_once);
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

const REPLAY_ATTRIBUTES_KEPT = /^(?!data-|aria-|title$|alt$|placeholder$|href$|src$|srcset$|value$|content$|name$|label$|download$|action$|poster$)/i;

/**
 * Session-replay `maskAttributeFn`: attributes that can carry user text or
 * URLs (title, aria-*, alt, placeholder, href, src, value, data-*) are bulleted;
 * layout attributes (class, id, style, ...) stay so the replay still looks right.
 */
export function maskReplayAttribute(name: string, value: string): string {
  return REPLAY_ATTRIBUTES_KEPT.test(name) ? value : value.replace(/\S/g, '\u2022');
}

/**
 * Session-replay `maskCapturedNetworkRequestFn`. The SDK passes every network
 * entry through it and also the page URL of replay Meta events (`name`), so it
 * reduces them to origin + templated path. Entries whose URL cannot be
 * reduced are dropped.
 */
export function maskReplayUrlRequest<T extends { name?: string }>(request: T): T | null {
  const name = sanitizeUrl(request.name);
  return name === undefined ? null : { ...request, name };
}

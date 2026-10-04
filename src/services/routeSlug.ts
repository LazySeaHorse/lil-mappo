import type { AutoCamPreset } from '@/store/types';

/**
 * Parsing for airport-route deep links: `/routes/{from}-to-{to}?autocam=chase`.
 * Pure string handling only; resolving codes to airports and building the
 * project lives in `routeDeepLink.ts`. This is the contract the landing site
 * links against (see LLM-START-HERE.md, "Airport route deep links").
 */

export const DEFAULT_DEEP_LINK_AUTOCAM: AutoCamPreset = 'chase';

const AUTOCAM_PRESETS: readonly AutoCamPreset[] = ['chase', 'drone', 'reveal', 'topdown'];

// IATA codes are 3 letters; ICAO codes are 4 letters or digits (e.g. "K1G4").
const AIRPORT_CODE = '(?:[a-z]{3}|[a-z0-9]{4})';
const SLUG_PATTERN = new RegExp(`^(${AIRPORT_CODE})-to-(${AIRPORT_CODE})$`, 'i');

export type RouteSlugError = 'malformed' | 'same_airport';

export type ParsedRouteSlug =
  | { ok: true; from: string; to: string }
  | { ok: false; error: RouteSlugError };

/** Parses `jfk-to-lhr` (case-insensitive, surrounding whitespace ignored) into upper-case codes. */
export function parseRouteSlug(slug: string | null | undefined): ParsedRouteSlug {
  const match = SLUG_PATTERN.exec((slug ?? '').trim());
  if (!match) return { ok: false, error: 'malformed' };

  const from = match[1].toUpperCase();
  const to = match[2].toUpperCase();
  if (from === to) return { ok: false, error: 'same_airport' };
  return { ok: true, from, to };
}

/** Reads the `autocam` query value; anything missing or unknown falls back to the default preset. */
export function parseAutoCamParam(value: string | null | undefined): AutoCamPreset {
  const normalized = (value ?? '').trim().toLowerCase();
  return AUTOCAM_PRESETS.find((preset) => preset === normalized) ?? DEFAULT_DEEP_LINK_AUTOCAM;
}

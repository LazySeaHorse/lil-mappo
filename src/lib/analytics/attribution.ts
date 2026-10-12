/**
 * Signup attribution. Whitelisted UTM / ref values are read once from the landing
 * URL, sanitized, kept in sessionStorage (tab-scoped, cleared when the tab
 * closes) and stripped from the address bar. They are copied into the Supabase
 * signUp metadata so attribution survives opening the confirmation email on
 * another device. Attribution only: never trusted for anything else.
 */
import { currentAnalyticsRuntime } from './config';
import type { AttributionProps } from './events';
import { sanitizeAttribution } from './privacy';

const STORAGE_KEY = 'lm_attr';
const PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref'] as const;

/** Reads attribution from the URL (once), persists it for the tab, and removes it from the address bar. No-op when analytics is disabled. */
export function captureLandingAttribution(): void {
  if (typeof window === 'undefined' || !currentAnalyticsRuntime()) return;
  try {
    const url = new URL(window.location.href);
    if (!PARAMS.some((key) => url.searchParams.has(key))) return;
    const found = sanitizeAttribution(Object.fromEntries(url.searchParams));
    if (Object.keys(found).length > 0) {
      // First touch wins within a tab.
      const existing = readStoredAttribution();
      if (Object.keys(existing).length === 0) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(found));
    }
    for (const key of PARAMS) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch {
    // Storage blocked or URL unusable: attribution is best effort.
  }
}

function readStoredAttribution(): AttributionProps {
  try {
    return sanitizeAttribution(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return {};
  }
}

/** Attribution to send with signUp(); empty when analytics is disabled or nothing was captured. */
export function getSignupAttribution(): AttributionProps {
  if (typeof window === 'undefined' || !currentAnalyticsRuntime()) return {};
  return readStoredAttribution();
}

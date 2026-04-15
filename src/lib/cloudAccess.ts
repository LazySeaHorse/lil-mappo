import type { Subscription } from './database.types';
import type { ExportResolution } from '@/types/render';
import { BYOK_STORAGE_KEY } from '@/config/mapbox';

// ─── Tier helpers ─────────────────────────────────────────────────────────────

/** Returns true if the user has an active (or still-in-cancelling-period) Wanderer subscription. */
function isWanderer(subscription: Subscription | null | undefined): boolean {
  return (
    !!subscription &&
    subscription.tier === 'wanderer' &&
    (subscription.status === 'active' || subscription.status === 'cancelling')
  );
}

/** Returns true if the user has no active subscription (free tier). */
export function isFreeUser(subscription: Subscription | null | undefined): boolean {
  return !isWanderer(subscription);
}

// ─── BYOK ─────────────────────────────────────────────────────────────────────

/** Returns true if the user has a valid BYOK Mapbox token set in localStorage. */
export function hasByok(): boolean {
  if (typeof localStorage === 'undefined') return false;
  const token = localStorage.getItem(BYOK_STORAGE_KEY)?.trim();
  return !!token;
}

// ─── Cloud saves ──────────────────────────────────────────────────────────────

export const FREE_CLOUD_SAVE_LIMIT = 3;

/**
 * Returns true if the user is allowed to create a NEW cloud save.
 *
 * Rules:
 *  - Wanderer (active/cancelling)  → unlimited
 *  - Free user (no subscription)   → allowed if current save count < 3
 */
export function canCloudSave(
  subscription: Subscription | null | undefined,
  currentCloudSaveCount: number
): boolean {
  if (isWanderer(subscription)) return true;
  return currentCloudSaveCount < FREE_CLOUD_SAVE_LIMIT;
}

// ─── Export limits ────────────────────────────────────────────────────────────

export interface ExportLimits {
  /** Maximum allowed project/export duration in seconds. */
  maxDuration: number;
  /** Maximum allowed export resolution preset. */
  maxResolution: ExportResolution;
  /** Maximum allowed FPS. */
  maxFps: 30 | 60;
  /** True when limits are in effect (convenient shorthand). */
  limited: boolean;
}

const UNLIMITED: ExportLimits = {
  maxDuration: Infinity,
  maxResolution: '2160p',
  maxFps: 60,
  limited: false,
};

const FREE_LIMITS: ExportLimits = {
  maxDuration: 30,
  maxResolution: '720p',
  maxFps: 30,
  limited: true,
};

/**
 * Returns the export limits that apply to this user.
 *
 * BYOK lifts all quality/duration restrictions regardless of subscription tier.
 * Wanderer subscribers always have unlimited exports.
 * Everyone else (free, guest) is capped at 720p / 30fps / 30s.
 */
export function getExportLimits(
  subscription: Subscription | null | undefined
): ExportLimits {
  if (hasByok()) return UNLIMITED;
  if (isWanderer(subscription)) return UNLIMITED;
  return FREE_LIMITS;
}

// ─── Map load quota ───────────────────────────────────────────────────────────

/**
 * Returns true if this user's map loads are server-tracked.
 * Wanderer subscribers and BYOK users have unlimited loads.
 */
export function isMapLoadTracked(
  subscription: Subscription | null | undefined
): boolean {
  if (hasByok()) return false;
  if (isWanderer(subscription)) return false;
  return true;
}

// ─── Guest load counter (localStorage) ───────────────────────────────────────

const GUEST_LOAD_KEY = 'mappo-guest-loads';
const GUEST_SESSION_KEY = 'mappo-session-counted';
export const GUEST_LOAD_LIMIT = 3;

/** How many loads the guest has used so far. */
export function getGuestLoadCount(): number {
  try {
    return parseInt(localStorage.getItem(GUEST_LOAD_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Increments the guest load counter, but only once per browser session.
 * Returns the new count.
 */
export function incrementGuestLoadCount(): number {
  try {
    if (sessionStorage.getItem(GUEST_SESSION_KEY)) {
      // Already counted this session (e.g. React StrictMode double-invoke)
      return getGuestLoadCount();
    }
    const next = getGuestLoadCount() + 1;
    localStorage.setItem(GUEST_LOAD_KEY, String(next));
    sessionStorage.setItem(GUEST_SESSION_KEY, '1');
    return next;
  } catch {
    return 0;
  }
}

/** Returns true if the guest has reached their load limit AND has no BYOK token. */
export function isGuestBlocked(): boolean {
  if (hasByok()) return false;
  return getGuestLoadCount() >= GUEST_LOAD_LIMIT;
}

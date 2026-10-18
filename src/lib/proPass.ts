import type { Subscription } from './database.types';

/**
 * Pro pass: a one-time purchase that unlocks everything Wanderer unlocks for a
 * few days. The end time lives in `public.pro_passes` (migration 023) and only
 * the Dodo webhook writes it. The client never grants a pass; it only reads it.
 */

export const PRO_PASS_DAYS = 3;
export const PRO_PASS_PRICE = 3;

/**
 * Merges the user's pass end into their subscription row, so every gate can
 * keep taking one `Subscription` (see `isWanderer`). A user with a pass but no
 * subscription row gets a row with status "none", which no subscription rule
 * accepts, so only the pass can unlock anything for them.
 *
 * MIRRORS `withProPass` in `api/_lib/entitlement.ts`.
 */
export function withProPass(
  subscription: Subscription | null,
  passExpiresAt: string | null,
  userId: string,
): Subscription | null {
  if (subscription) return { ...subscription, pass_expires_at: passExpiresAt };
  if (!passExpiresAt) return null;
  return {
    user_id: userId,
    tier: 'wanderer',
    status: 'none',
    monthly_credits: 0,
    parallel_renders: 0,
    renewal_date: null,
    dodo_subscription_id: null,
    created_at: passExpiresAt,
    updated_at: passExpiresAt,
    pass_expires_at: passExpiresAt,
  };
}

/** "Oct 21" (adds the year when it is not this year). */
export function formatPassEnd(end: Date, now = new Date()): string {
  return end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(end.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

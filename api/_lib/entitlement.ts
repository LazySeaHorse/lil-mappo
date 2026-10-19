import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side paid-plan ("Wanderer") check.
 *
 * MIRRORS `isWanderer` (and `withProPass`) in `src/lib/cloudAccess.ts` and
 * `src/lib/proPass.ts`. Vercel compiles `api/` independently from Vite, so it
 * cannot import `src/` (see the note in `render.ts`). Keep the two in sync:
 * `src/lib/cloudAccess.test.ts` runs both against the same table. The SQL copy
 * is `public.has_pro_access` (migration 023).
 *
 * Rules: tier `wanderer` and status `active`, or status `cancelling` up to and
 * including `renewal_date` (DATE values compared as UTC calendar dates). A
 * cancelling subscription without a renewal date is not entitled, so a missed
 * expiry webhook cannot leave a cancelled account with paid features forever.
 * OR a Pro pass whose `pass_expires_at` is still in the future.
 */
export type SubscriptionEntitlement = {
  tier: string;
  status: string;
  renewal_date: string | null;
  /** End of the Pro pass, from `pro_passes.expires_at` (see `withProPass`). */
  pass_expires_at?: string | null;
} | null | undefined;

export function isWanderer(
  subscription: SubscriptionEntitlement,
  today = new Date().toISOString().slice(0, 10),
  now = Date.now(),
): boolean {
  if (!subscription) return false;
  const passEnd = subscription.pass_expires_at ? Date.parse(subscription.pass_expires_at) : NaN;
  if (Number.isFinite(passEnd) && passEnd > now) return true;
  if (subscription.tier !== "wanderer") return false;
  if (subscription.status === "active") return true;
  return (
    subscription.status === "cancelling" &&
    !!subscription.renewal_date &&
    subscription.renewal_date >= today
  );
}

/**
 * Merges a Pro pass end into a subscription row. A pass without a subscription
 * becomes a row with status "none", which no subscription rule accepts.
 */
export function withProPass(
  subscription: Exclude<SubscriptionEntitlement, undefined>,
  passExpiresAt: string | null,
): Exclude<SubscriptionEntitlement, undefined> {
  if (subscription) return { ...subscription, pass_expires_at: passExpiresAt };
  if (!passExpiresAt) return null;
  return { tier: "wanderer", status: "none", renewal_date: null, pass_expires_at: passExpiresAt };
}

/**
 * Reads what `isWanderer` needs for one user (subscription + Pro pass, in
 * parallel) with a service-role client. When the subscription cannot be read,
 * `data` is null and the caller decides whether to fail closed. A pass that
 * cannot be read is logged and treated as no pass, so a good subscription is
 * never discarded (the client's `useSubscription` does the same).
 */
export async function loadEntitlement(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ data: Exclude<SubscriptionEntitlement, undefined>; error: unknown }> {
  const [sub, pass] = await Promise.all([
    supabase.from("subscriptions").select("tier, status, renewal_date").eq("user_id", userId).maybeSingle(),
    supabase.from("pro_passes").select("expires_at").eq("user_id", userId).maybeSingle(),
  ]);
  if (sub.error) return { data: null, error: sub.error };
  if (pass.error) console.error("[entitlement] Pro pass read failed, treating as no pass:", pass.error);
  const passEnd = pass.error ? null : (pass.data as { expires_at?: string } | null)?.expires_at ?? null;
  return { data: withProPass(sub.data as SubscriptionEntitlement ?? null, passEnd), error: null };
}

/**
 * Server-side paid-plan ("Wanderer") check.
 *
 * MIRRORS `isWanderer` in `src/lib/cloudAccess.ts`. Vercel compiles `api/`
 * independently from Vite, so it cannot import `src/` (see the note in
 * `render.ts`). Keep the two in sync: `src/lib/cloudAccess.test.ts` runs both
 * against the same table of subscriptions.
 *
 * Rules: tier `wanderer` and status `active`, or status `cancelling` up to and
 * including `renewal_date` (DATE values compared as UTC calendar dates). A
 * cancelling subscription without a renewal date is not entitled, so a missed
 * expiry webhook cannot leave a cancelled account with paid features forever.
 */
export type SubscriptionEntitlement = {
  tier: string;
  status: string;
  renewal_date: string | null;
} | null | undefined;

export function isWanderer(
  subscription: SubscriptionEntitlement,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  if (!subscription || subscription.tier !== "wanderer") return false;
  if (subscription.status === "active") return true;
  return (
    subscription.status === "cancelling" &&
    !!subscription.renewal_date &&
    subscription.renewal_date >= today
  );
}

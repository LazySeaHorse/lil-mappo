import { supabase } from '@/lib/supabase';

// =============================================================================
// TODO: Replace this entire file with Dodo Payments integration.
//
// When switching to real Dodo Payments:
//   1. Delete initiateMockCheckout() — replace with:
//        window.location.href = buildDodoCheckoutUrl(plan, email)
//      where buildDodoCheckoutUrl() hits your backend to create a Dodo
//      checkout session and returns its hosted URL.
//
//   2. Delete fulfillPendingCheckout() and all localStorage usage — move this
//      logic to a Supabase Edge Function (e.g. supabase/functions/dodo-webhook/)
//      that handles Dodo's `payment.succeeded` webhook event. That function
//      should use supabase.auth.admin.inviteUserByEmail(email) to create the
//      account server-side, then insert the subscription + credit_balance rows.
//
//   3. The PLAN_CONFIG and PlanSlug type stay — they're still needed frontend.
// =============================================================================

export type PlanSlug = 'cartographer' | 'pioneer';

export const PLAN_CONFIG: Record<PlanSlug, {
  name: string;
  price: string;
  priceMonthly: number;
  monthlyCredits: number;
  parallelRenders: number;
}> = {
  cartographer: {
    name: 'Cartographer',
    price: '$15/mo',
    priceMonthly: 15,
    monthlyCredits: 500,
    parallelRenders: 2,
  },
  pioneer: {
    name: 'Pioneer',
    price: '$35/mo',
    priceMonthly: 35,
    monthlyCredits: 2000,
    parallelRenders: 5,
  },
};

const PENDING_CHECKOUT_KEY = 'mappo_pending_checkout';

export interface PendingCheckout {
  plan: PlanSlug;
  email: string;
}

export function storePendingCheckout(checkout: PendingCheckout) {
  localStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(checkout));
}

export function getPendingCheckout(): PendingCheckout | null {
  try {
    const raw = localStorage.getItem(PENDING_CHECKOUT_KEY);
    return raw ? (JSON.parse(raw) as PendingCheckout) : null;
  } catch {
    return null;
  }
}

export function clearPendingCheckout() {
  localStorage.removeItem(PENDING_CHECKOUT_KEY);
}

/**
 * Sends a Supabase magic-link OTP to the given email address.
 * Shared by AuthModal (sign-in) and initiateMockCheckout (checkout flow).
 */
export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

/**
 * MOCK: Sends a magic-link OTP and stores the pending checkout in localStorage.
 *
 * TODO: Replace the body of this function with:
 *   window.location.href = buildDodoCheckoutUrl(plan, email);
 * and delete the storePendingCheckout() call (Dodo webhook handles fulfillment).
 */
export async function initiateMockCheckout(plan: PlanSlug, email: string): Promise<void> {
  await sendMagicLink(email);
  storePendingCheckout({ plan, email });
}

/**
 * MOCK: Called after SIGNED_IN — checks localStorage for a pending checkout
 * and provisions the subscription + credit_balance rows for that user.
 *
 * TODO: Delete this function when switching to Dodo. Fulfillment will happen
 * server-side in the dodo-webhook Edge Function instead.
 *
 * @returns The plan slug that was fulfilled, or null if nothing was pending.
 */
export async function fulfillPendingCheckout(userId: string): Promise<PlanSlug | null> {
  const pending = getPendingCheckout();
  if (!pending) return null;

  const config = PLAN_CONFIG[pending.plan];
  const renewalDate = new Date();
  renewalDate.setDate(renewalDate.getDate() + 30);
  const renewalDateStr = renewalDate.toISOString().split('T')[0];

  const { error: subError } = await supabase
    .from('subscriptions')
    .upsert({
      user_id: userId,
      tier: pending.plan,
      monthly_credits: config.monthlyCredits,
      parallel_renders: config.parallelRenders,
      renewal_date: renewalDateStr,
    });

  if (subError) {
    console.error('[mockCheckout] Failed to create subscription:', subError);
    return null; // Keep pending so it can retry on next sign-in
  }

  const { error: creditError } = await supabase
    .from('credit_balance')
    .upsert({
      user_id: userId,
      monthly_credits: config.monthlyCredits,
      monthly_reset_date: renewalDateStr,
    });

  if (creditError) {
    console.error('[mockCheckout] Failed to set credit_balance:', creditError);
  }

  clearPendingCheckout();
  return pending.plan;
}

import { supabase } from "@/lib/supabase";

// =============================================================================
// Types & constants
// =============================================================================

export type PlanSlug = "wanderer" | "cartographer" | "pioneer" | "topup";

/** Plans that require a subscription (not one-time top-ups). */
export type SubscriptionPlan = "wanderer" | "cartographer" | "pioneer";

export const PLAN_CONFIG: Record<
  SubscriptionPlan,
  {
    name: string;
    price: string;
    priceMonthly: number;
    monthlyCredits: number;
    parallelRenders: number;
  }
> = {
  wanderer: {
    name: "Wanderer",
    price: "$10/mo",
    priceMonthly: 10,
    monthlyCredits: 100,
    parallelRenders: 1,
  },
  cartographer: {
    name: "Cartographer",
    price: "$15/mo",
    priceMonthly: 15,
    monthlyCredits: 500,
    parallelRenders: 2,
  },
  pioneer: {
    name: "Pioneer",
    price: "$35/mo",
    priceMonthly: 35,
    monthlyCredits: 2000,
    parallelRenders: 5,
  },
};

// =============================================================================
// Pending plan — persists across the magic-link page reload
//
// When an unauthenticated user clicks Subscribe, we store their chosen plan
// here before opening the AuthModal. After the SIGNED_IN event fires (magic
// link or OAuth), useAuthStore reads this value and triggers checkout.
// =============================================================================

const PENDING_PLAN_KEY = "mappo_pending_plan";

export function storePendingPlan(plan: SubscriptionPlan): void {
  localStorage.setItem(PENDING_PLAN_KEY, plan);
}

export function getPendingPlan(): SubscriptionPlan | null {
  const raw = localStorage.getItem(PENDING_PLAN_KEY);
  return raw === "wanderer" || raw === "cartographer" || raw === "pioneer"
    ? raw
    : null;
}

export function clearPendingPlan(): void {
  localStorage.removeItem(PENDING_PLAN_KEY);
}

// =============================================================================
// Pending topup — persists across the magic-link / password-confirm page reload
//
// When an unauthenticated user selects a credit pack, we store the dollar
// amount here before opening the signup modal. After SIGNED_IN fires,
// useAuthStore reads this value and triggers the topup checkout.
// =============================================================================

const PENDING_TOPUP_KEY = "mappo_pending_topup";

export function storePendingTopup(amount: number): void {
  localStorage.setItem(PENDING_TOPUP_KEY, String(amount));
}

export function getPendingTopup(): number | null {
  const raw = localStorage.getItem(PENDING_TOPUP_KEY);
  const n = Number(raw);
  return raw !== null && !isNaN(n) && n > 0 ? n : null;
}

export function clearPendingTopup(): void {
  localStorage.removeItem(PENDING_TOPUP_KEY);
}

// =============================================================================
// Auth helpers (used by AuthModal)
// =============================================================================

/**
 * Sends a Supabase magic-link OTP to the given email address.
 */
export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

// =============================================================================
// Dodo checkout
// =============================================================================

export interface DodoCheckoutOptions {
  /** Number of $1 topup units (= slider value in dollars). Ignored for subscription plans. */
  quantity?: number;
  /** Where Dodo redirects after a completed payment. Defaults to /?checkout=success */
  returnUrl?: string;
  /** Where Dodo redirects if the user cancels. Defaults to origin. */
  cancelUrl?: string;
}

/**
 * Creates a Dodo checkout session via the Vercel API route and redirects
 * the browser to Dodo's hosted checkout page.
 *
 * The caller is responsible for showing a loading state — this function
 * either redirects (never returns) or throws on error.
 */
export async function initiateDodoCheckout(
  plan: PlanSlug,
  accessToken: string,
  opts: DodoCheckoutOptions = {}
): Promise<never> {
  const returnUrl =
    opts.returnUrl ?? `${window.location.origin}/?checkout=success`;
  const cancelUrl = opts.cancelUrl ?? window.location.origin;

  const res = await fetch("/api/dodo-create-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      plan,
      quantity: opts.quantity ?? 1,
      returnUrl,
      cancelUrl,
    }),
  });

  if (!res.ok) {
    let message = "Could not start checkout. Please try again.";
    try {
      const body = await res.json();
      if (typeof body?.error === "string") message = body.error;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }

  const { checkout_url } = await res.json();

  if (!checkout_url || typeof checkout_url !== "string") {
    throw new Error("Invalid response from checkout service.");
  }

  window.location.href = checkout_url;

  // TypeScript: we declared the return type as `never` because once we set
  // window.location.href the current page unloads. This cast satisfies the
  // compiler without lying to callers.
  return undefined as never;
}

import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { queryClient } from "@/lib/queryClient";
import { activePassEnd, hasActiveSubscription } from "@/lib/cloudAccess";
import type { Subscription } from "@/lib/database.types";
import { toast } from "sonner";
import {
  PASS_PLAN,
  PLAN_CONFIG,
  clearCheckoutReturnPlan,
  getCheckoutReturnPlan,
  isSuccessfulCheckoutReturn,
  type SubscriptionPlan,
} from "@/services/checkout";
import { PaymentSuccessCelebration } from "./PaymentSuccessCelebration";

interface CheckoutReturnState {
  plan: SubscriptionPlan | null;
  isTopup: boolean;
  isPass: boolean;
}

/** Seconds between refetches while the webhook has not landed yet (about 47 s in all). */
const POLL_DELAYS_S = [1, 2, 4, 8, 16, 16];
/** A top-up has nothing to wait for in the plan, so it gets one late refetch. */
const TOPUP_POLL_DELAYS_S = [3];
const PASS_TOAST_ID = "checkout-pass";

const invalidateAccount = () => {
  queryClient.invalidateQueries({ queryKey: ["subscription"] });
  queryClient.invalidateQueries({ queryKey: ["credit_balance"] });
};

const cachedPlans = () =>
  queryClient.getQueriesData<Subscription | null>({ queryKey: ["subscription"] }).map(([, plan]) => plan);

/** The latest pass end in the cached plan, or 0 when there is none. */
const cachedPassEnd = () =>
  Math.max(0, ...cachedPlans().map((plan) => activePassEnd(plan)?.getTime() ?? 0));

/**
 * Refetches the account after a payment, waiting longer each time (the Dodo webhook that grants
 * the plan lands a moment after the return), until `isDone`. Calls `onTimeout` if it never does.
 * Returns a function that stops it.
 */
function pollAccount(
  delaysS: number[],
  isDone: (() => boolean) | null,
  onDone: () => void,
  onTimeout: () => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const attempt = (index: number) => {
    timer = setTimeout(() => {
      invalidateAccount();
      if (isDone?.()) {
        onDone();
      } else if (index + 1 < delaysS.length) {
        attempt(index + 1);
      } else if (isDone) {
        onTimeout();
      }
    }, delaysS[index] * 1000);
  };
  invalidateAccount();
  attempt(0);
  return () => clearTimeout(timer);
}

function readCheckoutReturn(): CheckoutReturnState | null {
  const params = new URLSearchParams(window.location.search);
  if (!isSuccessfulCheckoutReturn(params)) return null;

  const storedPlan = getCheckoutReturnPlan();
  // Dodo's subscription return includes subscription_id/status but may replace
  // our checkout=success query. Wanderer is the only purchasable subscription
  // in the current UI, so this also supports checkouts started before the plan
  // marker was introduced.
  const isPass = storedPlan === PASS_PLAN;
  const plan = storedPlan && storedPlan !== "topup" && !isPass
    ? storedPlan
    : params.get("subscription_id")
      ? "wanderer"
      : null;

  return { plan, isTopup: storedPlan === "topup", isPass };
}

/**
 * Mounts the Supabase auth listener exactly once for the lifetime of the app.
 * Placing this in the component tree (rather than using a store-internal guard)
 * means React's useEffect cleanup correctly tears down and re-establishes the
 * subscription in Strict Mode dev double-invocation.
 *
 * Also handles successful Dodo return URLs, so the UI refreshes account data
 * and subscription purchases receive a dedicated confirmation experience.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initAuth = useAuthStore((s) => s.initAuth);
  const [checkoutReturn] = useState(readCheckoutReturn);
  const [showCelebration, setShowCelebration] = useState(
    () => !!checkoutReturn?.plan && !checkoutReturn.isTopup,
  );
  const handleCelebrationComplete = useCallback(() => {
    setShowCelebration(false);
  }, []);

  // ── Auth listener ──────────────────────────────────────────────────────────
  useEffect(() => {
    const cleanup = initAuth();
    return cleanup;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Checkout return handler ────────────────────────────────────────────────
  // Detect the return once and refresh subscription + credit data without
  // requiring another page reload.
  useEffect(() => {
    if (!checkoutReturn) return;
    const params = new URLSearchParams(window.location.search);

    // Strip Dodo's return fields, including the customer email, without navigation.
    params.delete("checkout");
    params.delete("subscription_id");
    params.delete("payment_id");
    params.delete("status");
    params.delete("email");
    clearCheckoutReturnPlan();
    const newSearch = params.toString();
    const newUrl =
      window.location.pathname +
      (newSearch ? `?${newSearch}` : "") +
      window.location.hash;
    window.history.replaceState(null, "", newUrl);

    // The webhook fires asynchronously, so the plan can arrive some seconds
    // after the return. Refetch with growing gaps until it shows up. Only the
    // webhook grants anything; this just looks.
    const stillProcessing = "Still processing, it'll appear shortly. Refresh in a minute.";
    if (checkoutReturn.isPass) {
      const passEndBefore = cachedPassEnd();
      toast.loading("Activating your pass…", { id: PASS_TOAST_ID });
      return pollAccount(
        POLL_DELAYS_S,
        () => cachedPassEnd() > passEndBefore,
        () => toast.success("Your 3-day pass is active.", { id: PASS_TOAST_ID, duration: 6000 }),
        () => toast.info(stillProcessing, { id: PASS_TOAST_ID, duration: 10_000 }),
      );
    }
    if (checkoutReturn.plan && !checkoutReturn.isTopup) {
      // The celebration covers the good news; only a plan that never lands needs a word.
      return pollAccount(
        POLL_DELAYS_S,
        () => cachedPlans().some((plan) => hasActiveSubscription(plan)),
        () => {},
        () => toast.info(stillProcessing, { duration: 10_000 }),
      );
    }
    toast.success("Payment received.", { duration: 6000 });
    return pollAccount(TOPUP_POLL_DELAYS_S, null, () => {}, () => {});
  }, [checkoutReturn]);

  const planName = checkoutReturn?.plan
    ? PLAN_CONFIG[checkoutReturn.plan].name
    : null;

  return (
    <>
      {children}
      {showCelebration && planName && (
        <PaymentSuccessCelebration
          planName={planName}
          onComplete={handleCelebrationComplete}
        />
      )}
    </>
  );
}

import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { queryClient } from "@/lib/queryClient";
import { toast } from "sonner";
import {
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
}

function readCheckoutReturn(): CheckoutReturnState | null {
  const params = new URLSearchParams(window.location.search);
  if (!isSuccessfulCheckoutReturn(params)) return null;

  const storedPlan = getCheckoutReturnPlan();
  // Dodo's subscription return includes subscription_id/status but may replace
  // our checkout=success query. Wanderer is the only purchasable subscription
  // in the current UI, so this also supports checkouts started before the plan
  // marker was introduced.
  const plan = storedPlan && storedPlan !== "topup"
    ? storedPlan
    : params.get("subscription_id")
      ? "wanderer"
      : null;

  return { plan, isTopup: storedPlan === "topup" };
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
  // Detect the return once and refresh subscription + credit data immediately
  // without requiring another page reload.
  useEffect(() => {
    if (!checkoutReturn) return;
    const params = new URLSearchParams(window.location.search);

    // Strip Dodo's return fields, including the customer email, without navigation.
    params.delete("checkout");
    params.delete("subscription_id");
    params.delete("status");
    params.delete("email");
    clearCheckoutReturnPlan();
    const newSearch = params.toString();
    const newUrl =
      window.location.pathname +
      (newSearch ? `?${newSearch}` : "") +
      window.location.hash;
    window.history.replaceState(null, "", newUrl);

    // The webhook fires asynchronously, so the subscription row might arrive
    // within a few seconds. Invalidate immediately and once more after a short
    // delay to catch any slight webhook latency.
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["credit_balance"] });
    };

    invalidate();
    const delayed = setTimeout(invalidate, 3000);

    if (!checkoutReturn.plan || checkoutReturn.isTopup) {
      toast.success("Payment received.", { duration: 6000 });
    }

    return () => clearTimeout(delayed);
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

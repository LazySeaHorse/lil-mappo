import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { queryClient } from "@/lib/queryClient";
import { toast } from "sonner";

/**
 * Mounts the Supabase auth listener exactly once for the lifetime of the app.
 * Placing this in the component tree (rather than using a store-internal guard)
 * means React's useEffect cleanup correctly tears down and re-establishes the
 * subscription in Strict Mode dev double-invocation.
 *
 * Also handles the ?checkout=success return URL that Dodo redirects to after a
 * completed payment, so the UI refreshes subscription/credit data immediately.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initAuth = useAuthStore((s) => s.initAuth);

  // ── Auth listener ──────────────────────────────────────────────────────────
  useEffect(() => {
    const cleanup = initAuth();
    return cleanup;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Checkout return handler ────────────────────────────────────────────────
  // Dodo redirects back to /?checkout=success after a completed payment.
  // We detect this once on mount, show a confirmation toast, and force-refresh
  // the subscription + credit caches so modals reflect the new state immediately
  // without requiring a page reload.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;

    // Strip the param from the URL without triggering a navigation
    params.delete("checkout");
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

    toast.success("Payment received! Your subscription is activating…", {
      duration: 6000,
    });

    return () => clearTimeout(delayed);
  }, []);

  return <>{children}</>;
}

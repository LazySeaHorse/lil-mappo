import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Subscription } from "@/lib/database.types";
import { activePassEnd } from "@/lib/cloudAccess";
import { withProPass } from "@/lib/proPass";
import { useAuthStore } from "@/store/useAuthStore";

const PASS_END_MARGIN_MS = 1000;
const MAX_PASS_POLL_MS = 6 * 3_600_000;

/**
 * While a Pro pass is active, refetch just after it ends so every gate locks
 * without a reload (gates also compare the end with the clock on each render).
 * Long, stacked passes are re-checked at least every six hours.
 */
export function passRefetchInterval(
  data: Subscription | null | undefined,
  now = Date.now(),
): number | false {
  const end = activePassEnd(data, now);
  if (!end) return false;
  return Math.min(end.getTime() - now + PASS_END_MARGIN_MS, MAX_PASS_POLL_MS);
}

/**
 * The user's plan: their subscription row (active or cancelling) with their
 * Pro pass end merged in (`pass_expires_at`). A user with only a pass gets a
 * row with status "none" (see `withProPass`); null means free. Pass every
 * result to the helpers in `cloudAccess.ts` rather than reading fields.
 */
export function useSubscription() {
  const user = useAuthStore((s) => s.user);

  return useQuery<Subscription | null>({
    queryKey: ["subscription", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const now = new Date();
      const [sub, pass] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("*")
          .eq("user_id", user!.id)
          .in("status", ["active", "cancelling"])
          .maybeSingle(),
        supabase
          .from("pro_passes")
          .select("expires_at")
          .eq("user_id", user!.id)
          .gt("expires_at", now.toISOString())
          .maybeSingle(),
      ]);

      if (sub.error) throw sub.error;
      // A failed pass lookup must not take a subscriber's plan away: treat it
      // as "no pass" (fails closed for the pass only).
      if (pass.error) console.warn("[useSubscription] Could not read the Pro pass:", pass.error.message);

      // Drop a pass that ended by this clock too, so the data changes (and
      // components re-render) when the end-of-pass refetch comes back.
      const end = (pass.data as { expires_at?: string } | null)?.expires_at ?? null;
      const passEnd = end && Date.parse(end) > now.getTime() ? end : null;
      return withProPass(sub.data as Subscription | null, passEnd, user!.id);
    },
    staleTime: 60_000,
    refetchInterval: (query) => passRefetchInterval(query.state.data),
  });
}

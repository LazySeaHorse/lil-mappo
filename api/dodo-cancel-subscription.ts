import type { VercelRequest, VercelResponse } from "@vercel/node";
import DodoPayments from "dodopayments";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── 1. Verify caller's Supabase JWT ────────────────────────────────────────

  const authHeader = req.headers["authorization"] as string | undefined;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const jwt = authHeader.slice(7);

  const supabaseAnon = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const {
    data: { user },
    error: authError,
  } = await supabaseAnon.auth.getUser(jwt);

  if (authError || !user) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  // ── 2. Fetch the user's active subscription ────────────────────────────────

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: sub, error: subError } = await supabaseAdmin
    .from("subscriptions")
    .select("dodo_subscription_id, tier")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (subError) {
    console.error("[dodo-cancel] DB error fetching subscription:", subError);
    return res.status(500).json({ error: "Could not fetch subscription" });
  }

  if (!sub?.dodo_subscription_id) {
    return res.status(404).json({ error: "No cancellable subscription found" });
  }

  // ── 3. Cancel at end of billing period via Dodo ────────────────────────────

  try {
    const dodo = new DodoPayments({
      bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
      environment: (process.env.DODO_ENVIRONMENT as "test_mode" | "live_mode") ?? "test_mode",
    });

    await dodo.subscriptions.update(sub.dodo_subscription_id, {
      cancel_at_next_billing_date: true,
      cancel_reason: "cancelled_by_customer",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[dodo-cancel] Dodo API error:", message);
    return res.status(502).json({ error: "Cancellation failed. Please try again." });
  }

  // ── 4. Mark as cancelling in Supabase ────────────────────────────────────
  // "cancelling" means: scheduled for cancellation at renewal_date, but still
  // fully active until then. The subscription.cancelled webhook transitions
  // this to "cancelled" at period end, then subscription.expired downgrades
  // to nomad with grace credits. This gives the UI immediate feedback while
  // preserving access.

  const { error: updateError } = await supabaseAdmin
    .from("subscriptions")
    .update({ status: "cancelling" })
    .eq("user_id", user.id);

  if (updateError) {
    console.error("[dodo-cancel] DB error updating status:", updateError);
    // Dodo cancellation succeeded — don't surface a 500 to the client.
    // The webhook will correct the DB state at period end regardless.
  }

  console.log("[dodo-cancel] Cancelled subscription for user", user.id, "tier:", sub.tier);

  return res.status(200).json({ success: true });
}

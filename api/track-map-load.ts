import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/track-map-load
 *
 * Called by the client on every page load for signed-in free-tier users.
 * Wanderer subscribers and BYOK users never call this endpoint.
 *
 * Body: (empty — user identity comes from the Authorization header)
 *
 * Returns:
 *   { allowed: true,  monthly_total: number, daily_total: number }
 *   { allowed: false, reason: "daily_throttled" | "monthly_exhausted" }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const authHeader = req.headers["authorization"];
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Verify the JWT and extract the user
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return res.status(401).json({ error: "Invalid token" });
  }

  // ── Skip tracking for Wanderer subscribers ────────────────────────────────
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("tier, status")
    .eq("user_id", user.id)
    .maybeSingle();

  const isWanderer =
    sub &&
    sub.tier === "wanderer" &&
    (sub.status === "active" || sub.status === "cancelling");

  if (isWanderer) {
    return res.status(200).json({ allowed: true, monthly_total: 0, daily_total: 0 });
  }

  // ── Call the RPC ──────────────────────────────────────────────────────────
  const { data, error } = await supabase.rpc("track_map_load", {
    p_user_id: user.id,
  });

  if (error) {
    console.error("[track-map-load] RPC error:", error);
    // Fail open: don't block the user if our quota system has an error
    return res.status(200).json({ allowed: true, monthly_total: 0, daily_total: 0 });
  }

  const result = Array.isArray(data) ? data[0] : data;

  return res.status(200).json({
    allowed: result.allowed,
    reason: result.reason ?? null,
    monthly_total: result.monthly_total,
    daily_total: result.daily_total,
  });
}

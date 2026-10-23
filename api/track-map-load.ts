import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminClient } from "./_lib/supabase.js";
import { isWanderer, loadEntitlement } from "./_lib/entitlement.js";

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
 *
 * Kept for the rollout of migration 025: current clients call the
 * `track_my_map_load` RPC directly and only come here when that function is
 * missing (PGRST202); cached older builds still call this. Remove once 025 is
 * applied everywhere and old clients have aged out.
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

  const supabase = adminClient();

  // Verify the JWT and extract the user
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return res.status(401).json({ error: "Invalid token" });
  }

  // ── Skip tracking for Wanderer subscribers and Pro pass holders ──────────
  // On a read error `sub` is null, so the load is counted (fails closed).
  const { data: sub } = await loadEntitlement(supabase, user.id);

  if (isWanderer(sub)) {
    return res.status(200).json({ allowed: true, monthly_total: 0, daily_total: 0 });
  }

  // ── Call the RPC ──────────────────────────────────────────────────────────
  const { data, error } = await supabase.rpc("track_map_load", {
    p_user_id: user.id,
  });

  if (error) {
    console.error("[track-map-load] RPC error:", error);
    return res.status(500).json({ error: "quota_unavailable" });
  }

  const result = Array.isArray(data) ? data[0] : data;

  return res.status(200).json({
    allowed: result.allowed,
    reason: result.reason ?? null,
    monthly_total: result.monthly_total,
    daily_total: result.daily_total,
  });
}

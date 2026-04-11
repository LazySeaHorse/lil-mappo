import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

/**
 * Deletes auth.users accounts that:
 *   1. Have no active subscription row (never completed a payment), AND
 *   2. Were created more than 24 hours ago.
 *
 * Invoked daily by Vercel Cron. Protected by the CRON_SECRET that Vercel
 * automatically passes as `Authorization: Bearer <CRON_SECRET>`.
 *
 * To change the grace period, update the hours constant below.
 */

const GRACE_PERIOD_HOURS = 24;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).end();
  }

  // ── Verify Vercel cron secret ──────────────────────────────────────────────
  const authHeader = req.headers["authorization"] as string | undefined;
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── List all auth users (paginated) ───────────────────────────────────────
  // For large user bases this should be converted to a Supabase RPC that does
  // the join server-side. For now, two queries are fine.

  let allUsers: { id: string; created_at: string }[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) {
      console.error("[cleanup] Failed to list users:", error);
      return res.status(500).json({ error: "Failed to list users" });
    }
    allUsers = allUsers.concat(
      data.users.map((u) => ({ id: u.id, created_at: u.created_at }))
    );
    if (data.users.length < perPage) break;
    page++;
  }

  // ── Fetch all user IDs that have ANY subscription row ─────────────────────
  const { data: subs, error: subsError } = await supabase
    .from("subscriptions")
    .select("user_id");

  if (subsError) {
    console.error("[cleanup] Failed to fetch subscriptions:", subsError);
    return res.status(500).json({ error: "Failed to fetch subscriptions" });
  }

  const subscribedIds = new Set((subs ?? []).map((s: { user_id: string }) => s.user_id));

  // ── Filter: no subscription AND created > grace period ago ────────────────
  const cutoff = new Date(Date.now() - GRACE_PERIOD_HOURS * 60 * 60 * 1000);

  const toDelete = allUsers.filter(
    (u) => !subscribedIds.has(u.id) && new Date(u.created_at) < cutoff
  );

  if (toDelete.length === 0) {
    console.log("[cleanup] No accounts to delete.");
    return res.status(200).json({ deleted: 0 });
  }

  // ── Delete each account ───────────────────────────────────────────────────
  let deleted = 0;
  const errors: string[] = [];

  for (const u of toDelete) {
    const { error: deleteError } = await supabase.auth.admin.deleteUser(u.id);
    if (deleteError) {
      console.error("[cleanup] Failed to delete user", u.id, ":", deleteError);
      errors.push(u.id);
    } else {
      deleted++;
    }
  }

  console.log(
    `[cleanup] Deleted ${deleted}/${toDelete.length} accounts.`,
    errors.length > 0 ? `Failed IDs: ${errors.join(", ")}` : ""
  );

  return res.status(200).json({ deleted, failed: errors.length });
}

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

  // ── Call atomic RPC to delete old free accounts ────────────────────────────
  // This uses a server-side function that atomically identifies users older than
  // the grace period with no subscriptions and deletes them in a single transaction.
  // This eliminates pagination race conditions and ensures consistency.
  const { data: result, error: rpcError } = await supabase.rpc(
    "delete_old_free_accounts",
    { p_grace_period_hours: GRACE_PERIOD_HOURS }
  );

  if (rpcError) {
    console.error("[cleanup] RPC failed:", rpcError);
    return res.status(500).json({ error: "Failed to cleanup accounts" });
  }

  if (!result || (result as unknown[]).length === 0) {
    console.error("[cleanup] RPC returned empty result");
    return res.status(500).json({ error: "Unexpected empty response from cleanup function" });
  }

  const [{ deleted_count, error_message }] = result as {
    deleted_count: number;
    error_message: string | null;
  }[];

  if (error_message) {
    console.error("[cleanup] Database error during cleanup:", error_message);
    return res.status(500).json({ error: "Database error during cleanup" });
  }

  console.log(`[cleanup] Deleted ${deleted_count} accounts.`);

  return res.status(200).json({ deleted: deleted_count });
}

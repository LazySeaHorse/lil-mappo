import type { VercelRequest, VercelResponse } from "@vercel/node";
import DodoPayments from "dodopayments";
import { createClient } from "@supabase/supabase-js";

// Disable Vercel's automatic body parsing — we need the raw bytes to verify
// Dodo's HMAC signature before we trust anything in the payload.
export const config = { api: { bodyParser: false } };

// ─── Product catalogue (mirrors Dodo dashboard) ──────────────────────────────

const TOPUP_PRODUCT_ID = "pdt_0NcOrfpOyxwhvUTpyd014";

const PLAN_FROM_PRODUCT: Record<
  string,
  { tier: string; monthlyCredits: number; parallelRenders: number }
> = {
  pdt_0NcOrHT55emkVniKFTlGo: {
    tier: "cartographer",
    monthlyCredits: 500,
    parallelRenders: 2,
  },
  pdt_0NcOrTPSI7LUw1lIEqSa2: {
    tier: "pioneer",
    monthlyCredits: 2000,
    parallelRenders: 5,
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** ISO timestamp → YYYY-MM-DD date string for Postgres `date` columns. */
function toDateString(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.split("T")[0];
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  // Guard: fail fast if secrets aren't in the environment yet.
  // This happens on the first deploy before the webhook is registered in Dodo.
  if (!process.env.DODO_WEBHOOK_SECRET) {
    console.error("[dodo-webhook] DODO_WEBHOOK_SECRET is not set");
    return res.status(500).json({ error: "Webhook not configured" });
  }

  // ── 1. Read raw body (must come before any JSON parsing) ─────────────────

  const rawBody = await readRawBody(req);

  // ── 2. Verify Dodo signature + parse event ────────────────────────────────

  const dodo = new DodoPayments({
    bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
    environment: "test_mode",
    webhookKey: process.env.DODO_WEBHOOK_SECRET,
  });

  let event: ReturnType<typeof dodo.webhooks.unwrap>;
  try {
    event = dodo.webhooks.unwrap(rawBody.toString(), {
      headers: req.headers as Record<string, string>,
    });
  } catch (err) {
    console.error("[dodo-webhook] Signature verification failed:", err);
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  // ── 3. Supabase admin client (bypasses RLS) ───────────────────────────────

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── 4. Dispatch ───────────────────────────────────────────────────────────

  try {
    switch (event.type) {
      // ── Subscription activated (first payment succeeded) ─────────────────
      case "subscription.active": {
        const sub = event.data;
        const uid = sub.metadata?.supabase_uid;

        if (!uid) {
          console.warn(
            "[dodo-webhook] subscription.active: missing supabase_uid in metadata"
          );
          break;
        }

        const plan = PLAN_FROM_PRODUCT[sub.product_id];
        if (!plan) {
          console.warn(
            "[dodo-webhook] subscription.active: unknown product_id:",
            sub.product_id
          );
          break;
        }

        const renewalDate = toDateString(sub.next_billing_date);

        // Upsert subscription row — idempotent if Dodo replays the event
        const { error: subError } = await supabase
          .from("subscriptions")
          .upsert(
            {
              user_id: uid,
              tier: plan.tier,
              monthly_credits: plan.monthlyCredits,
              parallel_renders: plan.parallelRenders,
              renewal_date: renewalDate,
              dodo_subscription_id: sub.subscription_id,
              status: "active",
            },
            { onConflict: "user_id" }
          );

        if (subError) {
          console.error(
            "[dodo-webhook] Failed to upsert subscription:",
            subError
          );
          // Return 500 so Dodo retries
          return res
            .status(500)
            .json({ error: "DB error writing subscription" });
        }

        // Update credit_balance — preserve purchased_credits (never reset those)
        const { data: existingBalance } = await supabase
          .from("credit_balance")
          .select("purchased_credits")
          .eq("user_id", uid)
          .maybeSingle();

        if (existingBalance) {
          await supabase
            .from("credit_balance")
            .update({
              monthly_credits: plan.monthlyCredits,
              monthly_reset_date: renewalDate,
            })
            .eq("user_id", uid);
        } else {
          // Row should always exist (created by DB trigger on sign-up),
          // but handle gracefully if it somehow doesn't
          await supabase.from("credit_balance").insert({
            user_id: uid,
            monthly_credits: plan.monthlyCredits,
            purchased_credits: 0,
            monthly_reset_date: renewalDate,
          });
        }

        console.log(
          "[dodo-webhook] Provisioned subscription for user",
          uid,
          "→",
          plan.tier
        );
        break;
      }

      // ── One-time payment (topup credits) ─────────────────────────────────
      // Note: subscription first-payments also fire payment.succeeded, so we
      // distinguish by the `plan` field we embed in the session metadata.
      case "payment.succeeded": {
        const payment = event.data;

        if (payment.metadata?.plan !== "topup") break;

        const uid = payment.metadata?.supabase_uid;
        const credits = Number(payment.metadata?.credits ?? 0);

        if (!uid) {
          console.warn(
            "[dodo-webhook] payment.succeeded (topup): missing supabase_uid"
          );
          break;
        }
        if (credits <= 0) {
          console.warn(
            "[dodo-webhook] payment.succeeded (topup): invalid credits value:",
            payment.metadata?.credits
          );
          break;
        }

        // Read current balance then update — avoids overwriting other fields
        const { data: existing } = await supabase
          .from("credit_balance")
          .select("purchased_credits")
          .eq("user_id", uid)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("credit_balance")
            .update({
              purchased_credits: existing.purchased_credits + credits,
            })
            .eq("user_id", uid);
        } else {
          await supabase.from("credit_balance").insert({
            user_id: uid,
            monthly_credits: 0,
            purchased_credits: credits,
            monthly_reset_date: null,
          });
        }

        console.log(
          "[dodo-webhook] Added",
          credits,
          "purchased credits to user",
          uid
        );
        break;
      }

      // ── Subscription renewed (recurring payment succeeded) ────────────────
      case "subscription.renewed": {
        const sub = event.data;
        const uid = sub.metadata?.supabase_uid;
        const plan = PLAN_FROM_PRODUCT[sub.product_id];
        const renewalDate = toDateString(sub.next_billing_date);

        await supabase
          .from("subscriptions")
          .update({ renewal_date: renewalDate, status: "active" })
          .eq("dodo_subscription_id", sub.subscription_id);

        // Reset monthly credits for the new billing period
        if (uid && plan) {
          await supabase
            .from("credit_balance")
            .update({
              monthly_credits: plan.monthlyCredits,
              monthly_reset_date: renewalDate,
            })
            .eq("user_id", uid);
        }

        console.log("[dodo-webhook] Renewed subscription", sub.subscription_id);
        break;
      }

      // ── Subscription cancelled (by user or admin) ─────────────────────────
      case "subscription.cancelled": {
        const sub = event.data;
        await supabase
          .from("subscriptions")
          .update({ status: "cancelled" })
          .eq("dodo_subscription_id", sub.subscription_id);
        console.log(
          "[dodo-webhook] Cancelled subscription",
          sub.subscription_id
        );
        break;
      }

      // ── Subscription expired (end of billing period, not renewed) ─────────
      case "subscription.expired": {
        const sub = event.data;
        await supabase
          .from("subscriptions")
          .update({ status: "expired" })
          .eq("dodo_subscription_id", sub.subscription_id);
        console.log("[dodo-webhook] Expired subscription", sub.subscription_id);
        break;
      }

      default:
        // Acknowledge unhandled event types silently — Dodo sends many events
        break;
    }
  } catch (err) {
    console.error(
      "[dodo-webhook] Handler error for event",
      event.type,
      ":",
      err
    );
    // Return 500 so Dodo retries on infrastructure/DB failures
    return res.status(500).json({ error: "Internal handler error" });
  }

  return res.status(200).json({ received: true });
}

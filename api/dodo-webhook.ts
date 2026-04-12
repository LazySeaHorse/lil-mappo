import type { VercelRequest, VercelResponse } from "@vercel/node";
import DodoPayments from "dodopayments";
import { createClient } from "@supabase/supabase-js";

// Disable Vercel's automatic body parsing — we need the raw bytes to verify
// Dodo's HMAC signature before we trust anything in the payload.
export const config = { api: { bodyParser: false } };

// ─── Product catalogue ────────────────────────────────────────────────────────
// Product IDs differ between test_mode and live_mode — read from env vars.
// The topup product ID is only used to identify topup payments in this webhook.

type PlanConfig = { tier: string; monthlyCredits: number; parallelRenders: number };

function buildPlanFromProduct(): Record<string, PlanConfig> {
  const entries: Array<[string | undefined, PlanConfig]> = [
    [process.env.DODO_PRODUCT_WANDERER,     { tier: "wanderer",     monthlyCredits: 100,  parallelRenders: 1 }],
    [process.env.DODO_PRODUCT_CARTOGRAPHER, { tier: "cartographer", monthlyCredits: 500,  parallelRenders: 2 }],
    [process.env.DODO_PRODUCT_PIONEER,      { tier: "pioneer",      monthlyCredits: 2000, parallelRenders: 5 }],
  ];
  const map: Record<string, PlanConfig> = {};
  for (const [id, config] of entries) {
    if (id) map[id] = config;
  }
  return map;
}

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

  const PLAN_FROM_PRODUCT = buildPlanFromProduct();

  const dodo = new DodoPayments({
    bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
    environment: (process.env.DODO_ENVIRONMENT as "test_mode" | "live_mode") ?? "test_mode",
    webhookKey: process.env.DODO_WEBHOOK_SECRET,
  });

  // Normalize headers: Node delivers values as string | string[] | undefined.
  // The Dodo SDK expects Record<string, string>, so coerce arrays to their first
  // element (standard HTTP semantics for signature headers).
  const normalizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      normalizedHeaders[key] = Array.isArray(value) ? value[0] : value;
    }
  }

  let event: ReturnType<typeof dodo.webhooks.unwrap>;
  try {
    event = dodo.webhooks.unwrap(rawBody.toString(), {
      headers: normalizedHeaders,
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

        let creditError;
        if (existingBalance) {
          ({ error: creditError } = await supabase
            .from("credit_balance")
            .update({
              monthly_credits: plan.monthlyCredits,
              monthly_reset_date: renewalDate,
            })
            .eq("user_id", uid));
        } else {
          // Row should always exist (created by DB trigger on sign-up),
          // but handle gracefully if it somehow doesn't
          ({ error: creditError } = await supabase
            .from("credit_balance")
            .insert({
              user_id: uid,
              monthly_credits: plan.monthlyCredits,
              purchased_credits: 0,
              monthly_reset_date: renewalDate,
            }));
        }

        if (creditError) {
          console.error("[dodo-webhook] Failed to update credit_balance:", creditError);
          return res.status(500).json({ error: "DB error writing credits" });
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

        // Idempotency guard — insert the payment_id; if it already exists this
        // is a Dodo retry and we should not credit again.
        const { error: idempotencyError } = await supabase
          .from("processed_payments")
          .insert({ payment_id: payment.payment_id });

        if (idempotencyError) {
          if (idempotencyError.code === "23505") {
            // Unique violation — duplicate event, already processed
            console.log(
              "[dodo-webhook] payment.succeeded (topup): duplicate event, skipping",
              payment.payment_id
            );
            break;
          }
          console.error("[dodo-webhook] Failed to record payment idempotency key:", idempotencyError);
          return res.status(500).json({ error: "DB error recording payment" });
        }

        // Atomic increment — avoids race condition where two concurrent topup
        // webhooks for the same user read the same balance and one is lost.
        const { error: topupCreditError } = await supabase.rpc(
          "increment_purchased_credits",
          { p_user_id: uid, p_amount: credits }
        );

        if (topupCreditError) {
          console.error("[dodo-webhook] Failed to credit topup balance:", topupCreditError);
          return res.status(500).json({ error: "DB error writing credits" });
        }

        // Grant Nomad tier if the user has no active subscription.
        // Users on wanderer/cartographer/pioneer keep their existing tier.
        const { data: existingSub } = await supabase
          .from("subscriptions")
          .select("tier, status")
          .eq("user_id", uid)
          .maybeSingle();

        const hasActiveSub =
          existingSub &&
          (existingSub.status === "active" ||
            existingSub.status === "on_hold" ||
            existingSub.status === "cancelling");

        if (!hasActiveSub) {
          const { error: nomadError } = await supabase
            .from("subscriptions")
            .upsert(
              {
                user_id: uid,
                tier: "nomad",
                monthly_credits: 0,
                parallel_renders: 1,
                renewal_date: null,
                dodo_subscription_id: null,
                status: "active",
              },
              { onConflict: "user_id" }
            );
          if (nomadError) {
            console.error("[dodo-webhook] Failed to grant nomad tier:", nomadError);
            return res.status(500).json({ error: "DB error writing subscription" });
          }
        }

        console.log(
          "[dodo-webhook] Added",
          credits,
          "purchased credits to user",
          uid,
          hasActiveSub ? "(kept existing tier)" : "(granted nomad tier)"
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
      // For paid-tier subscribers (wanderer / cartographer / pioneer):
      //   • Downgrade to Nomad (status: active, no dodo_subscription_id)
      //   • Grant 10 non-expiring purchased credits as a grace allowance
      //     (Nomad can cloud-save as long as purchased_credits > 0)
      // Nomad-only users (credit-pack buyers) are not touched — their subscription
      // row has no dodo_subscription_id so they won't match this event.
      case "subscription.expired": {
        const sub = event.data;

        // Look up the existing row to check the tier before we mutate anything
        const { data: expiringSub } = await supabase
          .from("subscriptions")
          .select("user_id, tier")
          .eq("dodo_subscription_id", sub.subscription_id)
          .maybeSingle();

        if (!expiringSub) {
          console.warn(
            "[dodo-webhook] subscription.expired: no matching row for",
            sub.subscription_id
          );
          break;
        }

        const isPaidTier =
          expiringSub.tier === "wanderer" ||
          expiringSub.tier === "cartographer" ||
          expiringSub.tier === "pioneer";

        if (isPaidTier) {
          // Idempotency guard — prevent a Dodo replay from granting a second
          // batch of grace credits.  Mirror the pattern used by payment.succeeded.
          const eventKey = `subscription.expired:${sub.subscription_id}`;
          const { error: idempotencyError } = await supabase
            .from("processed_webhook_events")
            .insert({ event_key: eventKey });

          if (idempotencyError) {
            if (idempotencyError.code === "23505") {
              // Unique violation — duplicate event, already processed
              console.log(
                "[dodo-webhook] subscription.expired: duplicate event, skipping",
                sub.subscription_id
              );
              break;
            }
            console.error("[dodo-webhook] Failed to record expiry idempotency key:", idempotencyError);
            return res.status(500).json({ error: "DB error recording event" });
          }

          // Downgrade to Nomad — set status active so useSubscription() still
          // returns a row and canCloudSave() can gate on purchased_credits > 0
          const { error: downgradeError } = await supabase
            .from("subscriptions")
            .update({
              tier: "nomad",
              status: "active",
              monthly_credits: 0,
              parallel_renders: 1,
              renewal_date: null,
              dodo_subscription_id: null,
            })
            .eq("user_id", expiringSub.user_id);

          if (downgradeError) {
            console.error("[dodo-webhook] Failed to downgrade to nomad:", downgradeError);
            return res.status(500).json({ error: "DB error downgrading tier" });
          }

          // Grant 10 non-expiring credits atomically — same RPC used by the topup
          // flow, which also handles a missing row gracefully via an upsert fallback.
          const { error: creditError } = await supabase.rpc(
            "increment_purchased_credits",
            { p_user_id: expiringSub.user_id, p_amount: 10 }
          );

          if (creditError) {
            console.error("[dodo-webhook] Failed to grant grace credits:", creditError);
            return res.status(500).json({ error: "DB error granting credits" });
          }

          console.log(
            "[dodo-webhook] Expired",
            expiringSub.tier,
            "→ nomad + 10 grace credits for user",
            expiringSub.user_id
          );
        } else {
          // Already nomad or unknown — just mark expired and leave as-is
          await supabase
            .from("subscriptions")
            .update({ status: "expired" })
            .eq("dodo_subscription_id", sub.subscription_id);
          console.log("[dodo-webhook] Expired subscription", sub.subscription_id);
        }

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

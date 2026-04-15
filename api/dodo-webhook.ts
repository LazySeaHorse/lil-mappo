import type { VercelRequest, VercelResponse } from "@vercel/node";
import DodoPayments from "dodopayments";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

// Disable Vercel's automatic body parsing — we need the raw bytes to verify
// Dodo's HMAC signature before we trust anything in the payload.
export const config = { api: { bodyParser: false } };

// ─── Product catalogue ────────────────────────────────────────────────────────
// Product IDs differ between test_mode and live_mode — read from env vars.
// The topup product ID is only used to identify topup payments in this webhook.

type PlanConfig = { tier: string; monthlyCredits: number; parallelRenders: number };
type Plans = Record<string, PlanConfig>;

function buildPlanFromProduct(): Plans {
  const entries: Array<[string | undefined, PlanConfig]> = [
    [process.env.DODO_PRODUCT_WANDERER,     { tier: "wanderer",     monthlyCredits: 100,  parallelRenders: 1 }],
    [process.env.DODO_PRODUCT_CARTOGRAPHER, { tier: "cartographer", monthlyCredits: 500,  parallelRenders: 2 }],
    [process.env.DODO_PRODUCT_PIONEER,      { tier: "pioneer",      monthlyCredits: 2000, parallelRenders: 5 }],
  ];
  const map: Plans = {};
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

// ─── Minimal structural types for event data ──────────────────────────────────
// These match the Dodo SDK event shapes for the fields we actually use.

interface SubEventData {
  subscription_id: string;
  product_id: string;
  next_billing_date?: string | null;
  metadata?: Record<string, string | undefined> | null;
}

interface PaymentEventData {
  payment_id: string;
  metadata?: Record<string, string | undefined> | null;
}

// ─── Event handlers ───────────────────────────────────────────────────────────
// Each handler throws on DB failure (→ 500, Dodo retries) and returns normally
// on success or soft-skip (missing metadata, unknown product, etc. → 200).

async function handleSubscriptionActive(
  sub: SubEventData,
  supabase: SupabaseClient,
  plans: Plans
): Promise<void> {
  const uid = sub.metadata?.supabase_uid;
  if (!uid) {
    console.warn("[dodo-webhook] subscription.active: missing supabase_uid in metadata");
    return;
  }

  const plan = plans[sub.product_id];
  if (!plan) {
    console.warn("[dodo-webhook] subscription.active: unknown product_id:", sub.product_id);
    return;
  }

  const renewalDate = toDateString(sub.next_billing_date);
  const eventKey = `subscription.active:${sub.subscription_id}`;

  // Upsert subscription row
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
    console.error("[dodo-webhook] Failed to upsert subscription:", subError);
    throw new Error("DB error writing subscription");
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
      .update({ monthly_credits: plan.monthlyCredits, monthly_reset_date: renewalDate })
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
    throw new Error("DB error writing credits");
  }

  // Idempotency key written LAST — after all work is complete. This ensures a crash
  // or timeout between the key insert and credit provisioning cannot leave the user
  // with an active subscription but no credits. All operations above are SET-based
  // (idempotent), so a Dodo retry before the key is recorded safely re-runs them.
  const { error: idempotencyError } = await supabase
    .from("processed_webhook_events")
    .insert({ event_key: eventKey });

  if (idempotencyError && idempotencyError.code !== "23505") {
    // Non-conflict error — throw so Dodo retries and the key gets recorded.
    // The idempotent operations above are safe to re-run.
    console.error("[dodo-webhook] Failed to record activation idempotency key:", idempotencyError);
    throw new Error("DB error recording event");
  }

  console.log("[dodo-webhook] Provisioned subscription for user", uid, "→", plan.tier);
}

async function handlePaymentSucceeded(
  payment: PaymentEventData,
  supabase: SupabaseClient
): Promise<void> {
  // subscription first-payments also fire payment.succeeded — distinguish by
  // the `plan` field embedded in the session metadata.
  if (payment.metadata?.plan !== "topup") return;

  const uid = payment.metadata?.supabase_uid;
  const credits = Number(payment.metadata?.credits ?? 0);

  if (!uid) {
    console.warn("[dodo-webhook] payment.succeeded (topup): missing supabase_uid");
    return;
  }
  if (credits <= 0) {
    console.warn("[dodo-webhook] payment.succeeded (topup): invalid credits value:", payment.metadata?.credits);
    return;
  }

  // Idempotency guard — insert the payment_id; if it already exists this
  // is a Dodo retry and we should not credit again.
  const { error: idempotencyError } = await supabase
    .from("processed_payments")
    .insert({ payment_id: payment.payment_id });

  if (idempotencyError) {
    if (idempotencyError.code === "23505") {
      console.log("[dodo-webhook] payment.succeeded (topup): duplicate event, skipping", payment.payment_id);
      return;
    }
    console.error("[dodo-webhook] Failed to record payment idempotency key:", idempotencyError);
    throw new Error("DB error recording payment");
  }

  // Atomic increment — avoids race condition where two concurrent topup
  // webhooks for the same user read the same balance and one is lost.
  const { error: topupCreditError } = await supabase.rpc(
    "increment_purchased_credits",
    { p_user_id: uid, p_amount: credits }
  );

  if (topupCreditError) {
    console.error("[dodo-webhook] Failed to credit topup balance:", topupCreditError);
    // Roll back the idempotency key so Dodo can retry successfully.
    await supabase.from("processed_payments").delete().eq("payment_id", payment.payment_id);
    throw new Error("DB error writing credits");
  }

  console.log("[dodo-webhook] Added", credits, "purchased credits to user", uid);
}

async function handleSubscriptionRenewed(
  sub: SubEventData,
  supabase: SupabaseClient,
  plans: Plans
): Promise<void> {
  const renewalDate = toDateString(sub.next_billing_date);
  // Key scoped to the billing period so the legitimate credit reset on the NEXT
  // cycle is never blocked by a key from the previous period.
  const eventKey = `subscription.renewed:${sub.subscription_id}:${renewalDate}`;

  const { error: renewalUpdateError } = await supabase
    .from("subscriptions")
    .update({ renewal_date: renewalDate, status: "active" })
    .eq("dodo_subscription_id", sub.subscription_id);

  if (renewalUpdateError) {
    console.error("[dodo-webhook] Failed to update subscription on renewal:", renewalUpdateError);
    throw new Error("DB error updating subscription");
  }

  // Reset monthly credits for the new billing period
  const uid = sub.metadata?.supabase_uid;
  const plan = plans[sub.product_id];
  if (uid && plan) {
    const { error: creditResetError } = await supabase
      .from("credit_balance")
      .update({ monthly_credits: plan.monthlyCredits, monthly_reset_date: renewalDate })
      .eq("user_id", uid);

    if (creditResetError) {
      console.error("[dodo-webhook] Failed to reset credits on renewal:", creditResetError);
      throw new Error("DB error resetting credits");
    }
  }

  // Idempotency key written LAST — same rationale as subscription.active.
  const { error: idempotencyError } = await supabase
    .from("processed_webhook_events")
    .insert({ event_key: eventKey });

  if (idempotencyError && idempotencyError.code !== "23505") {
    console.error("[dodo-webhook] Failed to record renewal idempotency key:", idempotencyError);
    throw new Error("DB error recording event");
  }

  console.log("[dodo-webhook] Renewed subscription", sub.subscription_id);
}

async function handleSubscriptionCancelled(
  sub: SubEventData,
  supabase: SupabaseClient
): Promise<void> {
  await supabase
    .from("subscriptions")
    .update({ status: "cancelled" })
    .eq("dodo_subscription_id", sub.subscription_id);
  console.log("[dodo-webhook] Cancelled subscription", sub.subscription_id);
}

async function handleSubscriptionExpired(
  sub: SubEventData,
  supabase: SupabaseClient
): Promise<void> {
  // Look up the existing row so we have the user_id
  const { data: expiringSub } = await supabase
    .from("subscriptions")
    .select("user_id, tier")
    .eq("dodo_subscription_id", sub.subscription_id)
    .maybeSingle();

  if (!expiringSub) {
    console.warn("[dodo-webhook] subscription.expired: no matching row for", sub.subscription_id);
    return;
  }

  // Delete the subscription row — the user drops to the free tier.
  // Free tier = no subscription row. Existing cloud saves remain readable
  // and writable (UPDATE), but new saves are capped at 3 by the RLS policy.
  const { error: deleteError } = await supabase
    .from("subscriptions")
    .delete()
    .eq("user_id", expiringSub.user_id);

  if (deleteError) {
    console.error("[dodo-webhook] Failed to delete expired subscription:", deleteError);
    throw new Error("DB error deleting subscription");
  }

  console.log(
    "[dodo-webhook] Expired", expiringSub.tier,
    "→ free tier (subscription row deleted) for user", expiringSub.user_id
  );
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
    event = dodo.webhooks.unwrap(rawBody.toString(), { headers: normalizedHeaders });
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
      case "subscription.active":
        await handleSubscriptionActive(event.data as SubEventData, supabase, PLAN_FROM_PRODUCT);
        break;
      case "payment.succeeded":
        await handlePaymentSucceeded(event.data as PaymentEventData, supabase);
        break;
      case "subscription.renewed":
        await handleSubscriptionRenewed(event.data as SubEventData, supabase, PLAN_FROM_PRODUCT);
        break;
      case "subscription.cancelled":
        await handleSubscriptionCancelled(event.data as SubEventData, supabase);
        break;
      case "subscription.expired":
        await handleSubscriptionExpired(event.data as SubEventData, supabase);
        break;
      default:
        // Acknowledge unhandled event types silently — Dodo sends many events
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal handler error";
    console.error("[dodo-webhook] Handler error for event", event.type, ":", err);
    return res.status(500).json({ error: message });
  }

  return res.status(200).json({ received: true });
}

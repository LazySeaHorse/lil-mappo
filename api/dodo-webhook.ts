import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { buildPlanFromProduct } from "./_lib/dodo/planCatalogue.js";
import { readRawBody, verifyDodoWebhook } from "./_lib/dodo/verify.js";
import { BillingService } from "./_lib/dodo/billingService.js";
import {
  dispatchWebhookEvent,
  handleSubscriptionActive,
  handlePaymentSucceeded,
  handleSubscriptionRenewed,
  handleSubscriptionCancelled,
  handleSubscriptionExpired,
  handleSubscriptionUnavailable,
  handleDunningRecovered,
} from "./_lib/dodo/eventHandlers.js";

// Re-export types and functions for test compatibility & consumer flexibility
export type { PlanConfig, Plans, SubEventData, PaymentEventData, DunningEventData, WebhookEvent } from "./_lib/dodo/types.js";
export {
  buildPlanFromProduct,
  readRawBody,
  verifyDodoWebhook,
  BillingService,
  dispatchWebhookEvent,
  handleSubscriptionActive,
  handlePaymentSucceeded,
  handleSubscriptionRenewed,
  handleSubscriptionCancelled,
  handleSubscriptionExpired,
  handleSubscriptionUnavailable,
  handleDunningRecovered,
};

// Disable Vercel's automatic body parsing — we need the raw bytes to verify
// Dodo's HMAC signature before we trust anything in the payload.
export const config = { api: { bodyParser: false } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  // Guard: fail fast if secrets aren't in the environment yet.
  if (!process.env.DODO_WEBHOOK_SECRET) {
    console.error("[dodo-webhook] DODO_WEBHOOK_SECRET is not set");
    return res.status(500).json({ error: "Webhook not configured" });
  }

  // 1. Read raw body
  const rawBody = await readRawBody(req);

  // 2. Verify Dodo signature + parse event
  let event;
  try {
    event = verifyDodoWebhook(rawBody, req.headers, {
      apiKey: process.env.DODO_PAYMENTS_API_KEY,
      environment: (process.env.DODO_ENVIRONMENT as "test_mode" | "live_mode") ?? "test_mode",
      webhookSecret: process.env.DODO_WEBHOOK_SECRET,
    });
  } catch (err) {
    console.error("[dodo-webhook] Signature verification failed:", err);
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  // 3. Supabase admin client (bypasses RLS)
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 4. Dispatch to Billing Service
  const billingService = new BillingService(supabase);
  const planCatalogue = buildPlanFromProduct();

  try {
    await dispatchWebhookEvent(event, billingService, planCatalogue);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal handler error";
    console.error("[dodo-webhook] Handler error for event", event.type, ":", err);
    return res.status(500).json({ error: message });
  }

  return res.status(200).json({ received: true });
}

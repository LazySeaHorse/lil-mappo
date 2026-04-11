import type { VercelRequest, VercelResponse } from "@vercel/node";
import DodoPayments from "dodopayments";
import { createClient } from "@supabase/supabase-js";

// ─── Product catalogue ────────────────────────────────────────────────────────
// Product IDs differ between test_mode and live_mode, so they are read from
// environment variables. Set DODO_PRODUCT_* in Vercel for each environment.

type PlanSlug = "wanderer" | "cartographer" | "pioneer" | "topup";

function getProductIds(): Record<PlanSlug, string> {
  const ids = {
    wanderer:     process.env.DODO_PRODUCT_WANDERER,
    cartographer: process.env.DODO_PRODUCT_CARTOGRAPHER,
    pioneer:      process.env.DODO_PRODUCT_PIONEER,
    topup:        process.env.DODO_PRODUCT_TOPUP,
  };
  const missing = Object.entries(ids)
    .filter(([, v]) => !v)
    .map(([k]) => `DODO_PRODUCT_${k.toUpperCase()}`);
  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }
  return ids as Record<PlanSlug, string>;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── 1. Parse & validate body ──────────────────────────────────────────────

  const { plan, quantity, returnUrl, cancelUrl } = (req.body ?? {}) as {
    plan?: string;
    quantity?: number;
    returnUrl?: string;
    cancelUrl?: string;
  };

  const validPlans: PlanSlug[] = ["wanderer", "cartographer", "pioneer", "topup"];
  if (!plan || !validPlans.includes(plan as PlanSlug)) {
    return res.status(400).json({ error: "Invalid plan" });
  }

  let PRODUCT_IDS: Record<PlanSlug, string>;
  try {
    PRODUCT_IDS = getProductIds();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server misconfiguration";
    console.error("[dodo-create-session]", message);
    return res.status(500).json({ error: "Checkout not available" });
  }
  if (!returnUrl || !cancelUrl) {
    return res
      .status(400)
      .json({ error: "returnUrl and cancelUrl are required" });
  }

  // For topup: quantity = slider value in dollars (= number of $1 units).
  // Clamp server-side to match UI bounds and prevent abuse.
  const safeQuantity =
    plan === "topup"
      ? Math.max(10, Math.min(200, Math.round(Number(quantity) || 10)))
      : 1;

  // ── 2. Verify the caller's Supabase JWT ───────────────────────────────────

  const authHeader = req.headers["authorization"] as string | undefined;
  if (!authHeader?.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Missing or malformed Authorization header" });
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

  // ── 3. Create the Dodo checkout session ───────────────────────────────────

  try {
    const dodo = new DodoPayments({
      bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
      environment: (process.env.DODO_ENVIRONMENT as "test_mode" | "live_mode") ?? "test_mode",
    });

    const session = await dodo.checkoutSessions.create({
      product_cart: [
        {
          product_id: PRODUCT_IDS[plan as PlanSlug],
          quantity: safeQuantity,
        },
      ],
      metadata: {
        supabase_uid: user.id,
        plan,
        // For topup: tell the webhook exactly how many credits to grant
        ...(plan === "topup"
          ? { credits: String(safeQuantity * 100) }
          : {}),
      },
      return_url: returnUrl,
      cancel_url: cancelUrl,
    });

    if (!session.checkout_url) {
      return res
        .status(502)
        .json({ error: "Dodo did not return a checkout URL" });
    }

    return res.status(200).json({ checkout_url: session.checkout_url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[dodo-create-session] Dodo API error:", message);
    return res
      .status(502)
      .json({ error: `Checkout session creation failed: ${message}` });
  }
}

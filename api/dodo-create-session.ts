import type { VercelRequest, VercelResponse } from "@vercel/node";
import DodoPayments from "dodopayments";
import { createClient } from "@supabase/supabase-js";

// ─── Product catalogue (mirrors Dodo dashboard) ──────────────────────────────

const PRODUCT_IDS = {
  cartographer: "pdt_0NcOrHT55emkVniKFTlGo",
  pioneer: "pdt_0NcOrTPSI7LUw1lIEqSa2",
  topup: "pdt_0NcOrfpOyxwhvUTpyd014",
} as const;

type PlanSlug = keyof typeof PRODUCT_IDS;

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

  if (!plan || !(plan in PRODUCT_IDS)) {
    return res.status(400).json({ error: "Invalid plan" });
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
      environment: "test_mode",
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

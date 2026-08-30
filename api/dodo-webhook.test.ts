// @vitest-environment node

import { Readable } from "node:stream";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sdkMocks = vi.hoisted(() => ({
  unwrap: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("dodopayments", () => ({
  default: class MockDodoPayments {
    webhooks = { unwrap: sdkMocks.unwrap };
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: sdkMocks.createClient,
}));

import webhookHandler, {
  dispatchWebhookEvent,
  handleSubscriptionActive,
  handleSubscriptionExpired,
} from "./dodo-webhook";

const PLANS = {
  "prod-wanderer": { tier: "wanderer", monthlyCredits: 100, parallelRenders: 1 },
};

function response() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      res.body = body;
      return res;
    }),
    end: vi.fn(() => res),
  };
  return res as unknown as VercelResponse & typeof res;
}

function updateClient() {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { client: { from } as unknown as SupabaseClient, from, update, eq };
}

describe("Dodo subscription webhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DODO_WEBHOOK_SECRET = "whsec_test";
    process.env.DODO_PAYMENTS_API_KEY = "dodo_test";
    process.env.DODO_PRODUCT_WANDERER = "prod-wanderer";
  });

  it("rejects an invalid webhook signature before opening a database client", async () => {
    sdkMocks.unwrap.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const req = Object.assign(Readable.from([Buffer.from("{}")]), {
      method: "POST",
      headers: { "webhook-signature": "invalid" },
    }) as unknown as VercelRequest;
    const res = response();

    await webhookHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid webhook signature" });
    expect(sdkMocks.createClient).not.toHaveBeenCalled();
  });

  it("provisions the server-selected plan after a successful subscription", async () => {
    const subscriptionUpsert = vi.fn().mockResolvedValue({ error: null });
    const creditUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const eventInsert = vi.fn().mockResolvedValue({ error: null });
    const creditLookup = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { purchased_credits: 7 } }) })),
      })),
      update: vi.fn(() => ({ eq: creditUpdateEq })),
    };
    const from = vi.fn((table: string) => {
      if (table === "subscriptions") return { upsert: subscriptionUpsert };
      if (table === "credit_balance") return creditLookup;
      if (table === "processed_webhook_events") return { insert: eventInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    await handleSubscriptionActive(
      {
        subscription_id: "sub-1",
        product_id: "prod-wanderer",
        next_billing_date: "2026-09-30T00:00:00Z",
        metadata: { supabase_uid: "user-1" },
      },
      { from } as unknown as SupabaseClient,
      PLANS,
    );

    expect(subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        tier: "wanderer",
        status: "active",
        dodo_subscription_id: "sub-1",
      }),
      { onConflict: "user_id" },
    );
    expect(creditLookup.update).toHaveBeenCalledWith({
      monthly_credits: 100,
      monthly_reset_date: "2026-09-30",
    });
    expect(eventInsert).toHaveBeenCalledWith({ event_key: "subscription.active:sub-1" });
  });

  it("does not grant anything for a failed card payment", async () => {
    const from = vi.fn();

    await dispatchWebhookEvent(
      { type: "payment.failed", data: { payment_id: "pay-failed" } },
      { from } as unknown as SupabaseClient,
      PLANS,
    );

    expect(from).not.toHaveBeenCalled();
  });

  it("does not grant anything for an unknown product", async () => {
    const from = vi.fn();

    await handleSubscriptionActive(
      {
        subscription_id: "sub-unknown",
        product_id: "attacker-controlled-product",
        metadata: { supabase_uid: "user-1" },
      },
      { from } as unknown as SupabaseClient,
      PLANS,
    );

    expect(from).not.toHaveBeenCalled();
  });

  it("reactivates the subscription after a successful renewal", async () => {
    const subscriptionEq = vi.fn().mockResolvedValue({ error: null });
    const creditEq = vi.fn().mockResolvedValue({ error: null });
    const eventInsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === "subscriptions") {
        return { update: vi.fn(() => ({ eq: subscriptionEq })) };
      }
      if (table === "credit_balance") {
        return { update: vi.fn(() => ({ eq: creditEq })) };
      }
      if (table === "processed_webhook_events") return { insert: eventInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    await dispatchWebhookEvent(
      {
        type: "subscription.renewed",
        data: {
          subscription_id: "sub-1",
          product_id: "prod-wanderer",
          next_billing_date: "2026-10-30T00:00:00Z",
          metadata: { supabase_uid: "user-1" },
        },
      },
      { from } as unknown as SupabaseClient,
      PLANS,
    );

    expect(subscriptionEq).toHaveBeenCalledWith("dodo_subscription_id", "sub-1");
    expect(eventInsert).toHaveBeenCalledWith({
      event_key: "subscription.renewed:sub-1:2026-10-30",
    });
  });

  it("keeps a cancelled subscription in cancelling state until period end", async () => {
    const db = updateClient();

    await dispatchWebhookEvent(
      { type: "subscription.cancelled", data: { subscription_id: "sub-1" } },
      db.client,
      PLANS,
    );

    expect(db.update).toHaveBeenCalledWith({ status: "cancelling" });
    expect(db.eq).toHaveBeenCalledWith("dodo_subscription_id", "sub-1");
  });

  it.each([
    ["subscription.on_hold", "on_hold"],
    ["subscription.failed", "failed"],
  ] as const)("removes entitlement for %s", async (eventType, status) => {
    const db = updateClient();

    await dispatchWebhookEvent(
      { type: eventType, data: { subscription_id: "sub-1" } },
      db.client,
      PLANS,
    );

    expect(db.update).toHaveBeenCalledWith({ status });
  });

  it("restores entitlement when payment recovery succeeds", async () => {
    const db = updateClient();

    await dispatchWebhookEvent(
      { type: "dunning.recovered", data: { subscription_id: "sub-1", status: "recovered" } },
      db.client,
      PLANS,
    );

    expect(db.update).toHaveBeenCalledWith({ status: "active" });
    expect(db.eq).toHaveBeenCalledWith("dodo_subscription_id", "sub-1");
  });

  it("deletes the subscription when its paid period expires", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { user_id: "user-1", tier: "wanderer" },
    });
    const selectEq = vi.fn(() => ({ maybeSingle }));
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce({ select: vi.fn(() => ({ eq: selectEq })) })
      .mockReturnValueOnce({ delete: vi.fn(() => ({ eq: deleteEq })) });

    await handleSubscriptionExpired(
      { subscription_id: "sub-1", product_id: "prod-wanderer" },
      { from } as unknown as SupabaseClient,
    );

    expect(deleteEq).toHaveBeenCalledWith("user_id", "user-1");
  });
});

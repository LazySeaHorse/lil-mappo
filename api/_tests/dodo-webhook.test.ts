// @vitest-environment node

import { Readable } from "node:stream";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdkMocks = vi.hoisted(() => ({
  unwrap: vi.fn(),
  createClient: vi.fn(),
  captureImmediate: vi.fn(),
  shutdown: vi.fn(),
  postHogCtor: vi.fn(),
}));

vi.mock("posthog-node", () => ({
  PostHog: class MockPostHog {
    constructor(key: string, options: unknown) {
      sdkMocks.postHogCtor(key, options);
    }
    captureImmediate = sdkMocks.captureImmediate;
    shutdown = sdkMocks.shutdown;
  },
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
} from "../dodo-webhook.js";

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

describe("Dodo webhook PostHog reporting", () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  function request(headers: Record<string, string> = {}) {
    return Object.assign(Readable.from([Buffer.from("{}")]), {
      method: "POST",
      headers: { "webhook-id": "msg_abc", "webhook-timestamp": "1790000000", ...headers },
    }) as unknown as VercelRequest;
  }

  function useEvent(event: { type: string; data: Record<string, unknown> }) {
    sdkMocks.unwrap.mockReturnValue(event);
  }

  /** Supabase double for the subscription.active path; `eventInsertError` simulates a duplicate or failure. */
  function provisioningDb(options: { eventInsertError?: { code: string }; upsertError?: unknown } = {}) {
    const from = vi.fn((table: string) => {
      if (table === "subscriptions") return { upsert: vi.fn().mockResolvedValue({ error: options.upsertError ?? null }) };
      if (table === "credit_balance") {
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { purchased_credits: 0 } }) })) })),
          update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
        };
      }
      if (table === "processed_webhook_events") {
        return { insert: vi.fn().mockResolvedValue({ error: options.eventInsertError ?? null }) };
      }
      throw new Error(`Unexpected table ${table}`);
    });
    sdkMocks.createClient.mockReturnValue({ from });
    return from;
  }

  const activeEvent = {
    type: "subscription.active",
    data: {
      subscription_id: "sub-1",
      product_id: "prod-wanderer",
      next_billing_date: "2026-09-30T00:00:00Z",
      metadata: { supabase_uid: "user-1" },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    process.env.DODO_WEBHOOK_SECRET = "whsec_test";
    process.env.DODO_PAYMENTS_API_KEY = "dodo_test";
    process.env.DODO_PRODUCT_WANDERER = "prod-wanderer";
    process.env.VITE_POSTHOG_KEY = "phc_test";
    delete process.env.DODO_ENVIRONMENT;
    sdkMocks.captureImmediate.mockResolvedValue(undefined);
    sdkMocks.shutdown.mockResolvedValue(undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.VITE_POSTHOG_KEY;
    vi.useRealTimers();
  });

  it("captures subscription_started once, with a deterministic uuid and the webhook timestamp", async () => {
    useEvent(activeEvent);
    provisioningDb();
    const res = response();

    await webhookHandler(request(), res);

    expect(res.statusCode).toBe(200);
    expect(sdkMocks.postHogCtor).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({ host: "https://eu.i.posthog.com", flushAt: 1, flushInterval: 0 }),
    );
    expect(sdkMocks.captureImmediate).toHaveBeenCalledTimes(1);
    const sent = sdkMocks.captureImmediate.mock.calls[0][0];
    expect(sent).toMatchObject({
      distinctId: "user-1",
      event: "subscription_started",
      properties: { tier: "wanderer", environment: "preview" },
      timestamp: new Date(1790000000 * 1000),
    });
    expect(sent.uuid).toMatch(UUID);
    expect(sdkMocks.shutdown).toHaveBeenCalled();

    // The same delivery yields the same uuid, so PostHog can de-duplicate.
    sdkMocks.captureImmediate.mockClear();
    useEvent(activeEvent);
    await webhookHandler(request(), response());
    expect(sdkMocks.captureImmediate.mock.calls[0][0].uuid).toBe(sent.uuid);
  });

  it("labels live-mode payments as production", async () => {
    process.env.DODO_ENVIRONMENT = "live_mode";
    useEvent(activeEvent);
    provisioningDb();
    await webhookHandler(request(), response());
    expect(sdkMocks.captureImmediate.mock.calls[0][0].properties.environment).toBe("production");
  });

  it("does not capture again for a retried delivery (duplicate idempotency key)", async () => {
    useEvent(activeEvent);
    provisioningDb({ eventInsertError: { code: "23505" } });
    const res = response();

    await webhookHandler(request(), res);

    expect(res.statusCode).toBe(200);
    expect(sdkMocks.captureImmediate).not.toHaveBeenCalled();
  });

  it("does not capture when the handler fails, and still reports the failure", async () => {
    useEvent(activeEvent);
    provisioningDb({ upsertError: { message: "db down" } });
    const res = response();

    await webhookHandler(request(), res);

    expect(res.statusCode).toBe(500);
    expect(sdkMocks.captureImmediate).not.toHaveBeenCalled();
  });

  it("still answers 200 when PostHog throws", async () => {
    sdkMocks.captureImmediate.mockRejectedValue(new Error("posthog down"));
    useEvent(activeEvent);
    provisioningDb();
    const res = response();

    await webhookHandler(request(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it("still answers 200 promptly when PostHog hangs", async () => {
    vi.useFakeTimers();
    sdkMocks.captureImmediate.mockReturnValue(new Promise(() => undefined));
    useEvent(activeEvent);
    provisioningDb();
    const res = response();

    const handled = webhookHandler(request(), res);
    await vi.advanceTimersByTimeAsync(2000);
    await handled;

    expect(res.statusCode).toBe(200);
  });

  it("never constructs PostHog without VITE_POSTHOG_KEY", async () => {
    delete process.env.VITE_POSTHOG_KEY;
    useEvent(activeEvent);
    provisioningDb();
    const res = response();

    await webhookHandler(request(), res);

    expect(res.statusCode).toBe(200);
    expect(sdkMocks.postHogCtor).not.toHaveBeenCalled();
  });

  it("captures subscription_cancelled, resolving the owner and tier from the row when metadata is missing", async () => {
    useEvent({ type: "subscription.cancelled", data: { subscription_id: "sub-1" } });
    const maybeSingle = vi.fn().mockResolvedValue({ data: { user_id: "user-9", tier: "pioneer" } });
    const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    sdkMocks.createClient.mockReturnValue({
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })), update })),
    });

    await webhookHandler(request(), response());

    expect(update).toHaveBeenCalledWith({ status: "cancelling" });
    expect(sdkMocks.captureImmediate.mock.calls[0][0]).toMatchObject({
      distinctId: "user-9",
      event: "subscription_cancelled",
      properties: { tier: "pioneer" },
    });
  });

  it("captures subscription_ended using the owner looked up before the row is deleted", async () => {
    useEvent({ type: "subscription.expired", data: { subscription_id: "sub-1", product_id: "prod-wanderer" } });
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: { user_id: "user-9", tier: "wanderer" } }) // analytics lookup
      .mockResolvedValueOnce({ data: { user_id: "user-9", tier: "wanderer" } }); // expireSubscription
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    sdkMocks.createClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
        delete: vi.fn(() => ({ eq: deleteEq })),
      })),
    });

    await webhookHandler(request(), response());

    expect(deleteEq).toHaveBeenCalledWith("user_id", "user-9");
    expect(sdkMocks.captureImmediate.mock.calls[0][0]).toMatchObject({
      distinctId: "user-9",
      event: "subscription_ended",
      properties: { tier: "wanderer" },
    });
  });

  it("does not report informational events", async () => {
    useEvent({ type: "payment.failed", data: { payment_id: "p1" } });
    sdkMocks.createClient.mockReturnValue({ from: vi.fn() });
    const res = response();
    await webhookHandler(request(), res);
    expect(res.statusCode).toBe(200);
    expect(sdkMocks.captureImmediate).not.toHaveBeenCalled();
  });
});

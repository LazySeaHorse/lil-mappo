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
}));

vi.mock("posthog-node", () => ({
  PostHog: class MockPostHog {
    captureImmediate = sdkMocks.captureImmediate;
    shutdown = sdkMocks.shutdown;
  },
}));

vi.mock("dodopayments", () => ({
  default: class MockDodoPayments {
    webhooks = { unwrap: sdkMocks.unwrap };
  },
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: sdkMocks.createClient }));

import webhookHandler, { dispatchWebhookEvent } from "../dodo-webhook.js";

const PLANS = { "prod-wanderer": { tier: "wanderer", monthlyCredits: 100, parallelRenders: 1 } };

function passPayment(overrides: Record<string, unknown> = {}) {
  return {
    payment_id: "pay_pass_1",
    status: "succeeded",
    currency: "USD",
    total_amount: 300,
    product_cart: [{ product_id: "prod-pass", quantity: 1 }],
    metadata: { supabase_uid: "user-1", plan: "pass_3day" },
    ...overrides,
  };
}

/** A Supabase double whose grant_pro_pass RPC answers like migration 023. */
function passDb(result: { granted: boolean; stacked: boolean } | Error = { granted: true, stacked: false }) {
  const rpc = vi.fn(async () =>
    result instanceof Error
      ? { data: null, error: { message: result.message } }
      : { data: [{ ...result, pass_expires_at: "2026-10-21T12:00:00Z" }], error: null },
  );
  const from = vi.fn(() => {
    throw new Error("a pass grant must not write tables directly");
  });
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, from };
}

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

describe("Pro pass webhook grant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DODO_PRODUCT_PASS_3DAY = "prod-pass";
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.DODO_PRODUCT_PASS_3DAY;
  });

  it("grants a 3-day pass for a paid pass product, keyed by the payment id", async () => {
    const db = passDb();

    const result = await dispatchWebhookEvent({ type: "payment.succeeded", data: passPayment() }, db.client, PLANS);

    expect(db.rpc).toHaveBeenCalledWith("grant_pro_pass", {
      p_user_id: "user-1",
      p_payment_id: "pay_pass_1",
      p_days: 3,
    });
    expect(db.from).not.toHaveBeenCalled();
    expect(result.pass).toEqual({ userId: "user-1", granted: true, stacked: false });
  });

  it("reports a replayed delivery as not granted (the RPC already saw the payment)", async () => {
    const db = passDb({ granted: false, stacked: false });

    const result = await dispatchWebhookEvent({ type: "payment.succeeded", data: passPayment() }, db.client, PLANS);

    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(result.pass).toEqual({ userId: "user-1", granted: false, stacked: false });
  });

  it("throws on a database error so Dodo retries", async () => {
    const db = passDb(new Error("db down"));

    await expect(
      dispatchWebhookEvent({ type: "payment.succeeded", data: passPayment() }, db.client, PLANS),
    ).rejects.toThrow();
  });

  it.each([
    ["another product", { product_cart: [{ product_id: "prod-topup", quantity: 1 }], metadata: { supabase_uid: "user-1" } }],
    ["no product cart", { product_cart: null, metadata: { supabase_uid: "user-1" } }],
    ["a payment that did not succeed", { status: "failed" }],
  ])("quietly ignores %s", async (_label, overrides) => {
    const db = passDb();

    const result = await dispatchWebhookEvent(
      { type: "payment.succeeded", data: passPayment(overrides) },
      db.client,
      PLANS,
    );

    expect(db.rpc).not.toHaveBeenCalled();
    expect(result.pass).toBeUndefined();
  });

  it.each([
    ["the pass product is not configured", () => { delete process.env.DODO_PRODUCT_PASS_3DAY; }, {}],
    ["the payment has no user id", () => {}, { metadata: { plan: "pass_3day" } }],
    ["a pass checkout lacks the pass product", () => {}, { product_cart: [{ product_id: "prod-other", quantity: 1 }] }],
  ])("throws, and marks nothing processed, when %s", async (_label, setup, overrides) => {
    setup();
    const db = passDb();

    await expect(
      dispatchWebhookEvent({ type: "payment.succeeded", data: passPayment(overrides) }, db.client, PLANS),
    ).rejects.toThrow();

    // No grant and no idempotency row, so Dodo's retry is processed in full.
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();
  });

  it("grants whatever amount was paid: the session is ours, so the product alone decides", async () => {
    const db = passDb();

    await dispatchWebhookEvent(
      { type: "payment.succeeded", data: passPayment({ currency: "INR", total_amount: 25000 }) },
      db.client,
      PLANS,
    );
    await dispatchWebhookEvent(
      { type: "payment.succeeded", data: passPayment({ payment_id: "pay_pass_2", total_amount: 0 }) },
      db.client,
      PLANS,
    );

    expect(db.rpc).toHaveBeenCalledTimes(2);
  });

  it("leaves subscription payments and top-ups alone", async () => {
    const db = passDb();

    await dispatchWebhookEvent(
      {
        type: "payment.succeeded",
        data: { payment_id: "pay_sub", subscription_id: "sub-1", metadata: { supabase_uid: "user-1", plan: "wanderer" } },
      },
      db.client,
      PLANS,
    );

    expect(db.rpc).not.toHaveBeenCalled();
  });
});

describe("Pro pass webhook end to end", () => {
  function request() {
    return Object.assign(Readable.from([Buffer.from("{}")]), {
      method: "POST",
      headers: { "webhook-id": "msg_pass", "webhook-timestamp": "1790000000" },
    }) as unknown as VercelRequest;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DODO_WEBHOOK_SECRET = "whsec_test";
    process.env.DODO_PAYMENTS_API_KEY = "dodo_test";
    process.env.DODO_PRODUCT_PASS_3DAY = "prod-pass";
    process.env.VITE_POSTHOG_KEY = "phc_test";
    sdkMocks.captureImmediate.mockResolvedValue(undefined);
    sdkMocks.shutdown.mockResolvedValue(undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.VITE_POSTHOG_KEY;
    delete process.env.DODO_PRODUCT_PASS_3DAY;
  });

  it("grants only from a verified webhook", async () => {
    sdkMocks.unwrap.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const res = response();

    await webhookHandler(request(), res);

    expect(res.statusCode).toBe(400);
    expect(sdkMocks.createClient).not.toHaveBeenCalled();
  });

  it("captures pass_purchased once for the first delivery, and not for a replay", async () => {
    sdkMocks.unwrap.mockReturnValue({ type: "payment.succeeded", data: passPayment() });
    sdkMocks.createClient.mockReturnValue(passDb({ granted: true, stacked: true }).client);
    const res = response();

    await webhookHandler(request(), res);

    expect(res.statusCode).toBe(200);
    expect(sdkMocks.captureImmediate).toHaveBeenCalledTimes(1);
    expect(sdkMocks.captureImmediate.mock.calls[0][0]).toMatchObject({
      distinctId: "user-1",
      event: "pass_purchased",
      properties: { stacked: true },
    });

    sdkMocks.captureImmediate.mockClear();
    sdkMocks.createClient.mockReturnValue(passDb({ granted: false, stacked: false }).client);
    await webhookHandler(request(), response());
    expect(sdkMocks.captureImmediate).not.toHaveBeenCalled();
  });

  it("answers 500 for a pass it cannot grant, and 200 for a payment that is not a pass", async () => {
    const db = passDb();
    sdkMocks.createClient.mockReturnValue(db.client);
    sdkMocks.unwrap.mockReturnValue({
      type: "payment.succeeded",
      data: passPayment({ metadata: { plan: "pass_3day" } }),
    });
    const failing = response();
    await webhookHandler(request(), failing);
    expect(failing.statusCode).toBe(500);

    sdkMocks.unwrap.mockReturnValue({
      type: "payment.succeeded",
      data: { payment_id: "pay_other", product_cart: [{ product_id: "prod-topup", quantity: 1 }], metadata: { plan: "wanderer" } },
    });
    const other = response();
    await webhookHandler(request(), other);
    expect(other.statusCode).toBe(200);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("answers 500 when the grant fails, so Dodo retries", async () => {
    sdkMocks.unwrap.mockReturnValue({ type: "payment.succeeded", data: passPayment() });
    sdkMocks.createClient.mockReturnValue(passDb(new Error("db down")).client);
    const res = response();

    await webhookHandler(request(), res);

    expect(res.statusCode).toBe(500);
    expect(sdkMocks.captureImmediate).not.toHaveBeenCalled();
  });
});

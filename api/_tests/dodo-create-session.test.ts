// @vitest-environment node

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createCheckout: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("dodopayments", () => ({
  default: class MockDodoPayments {
    checkoutSessions = { create: mocks.createCheckout };
  },
}));

import handler from "../dodo-create-session.js";

function request(body: Record<string, unknown>, token = "valid-token") {
  return {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body,
  } as unknown as VercelRequest;
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

const validBody = {
  plan: "wanderer",
  returnUrl: "https://app.example.com/?checkout=success",
  cancelUrl: "https://app.example.com/",
};

describe("subscription checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(process.env, {
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon-key",
      DODO_PAYMENTS_API_KEY: "dodo-key",
      DODO_ENVIRONMENT: "test_mode",
      DODO_PRODUCT_WANDERER: "prod-wanderer",
      DODO_PRODUCT_CARTOGRAPHER: "prod-cartographer",
      DODO_PRODUCT_PIONEER: "prod-pioneer",
      DODO_PRODUCT_TOPUP: "prod-topup",
      APP_DOMAIN: "app.example.com",
    });
    mocks.createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
    });
    mocks.createCheckout.mockResolvedValue({ checkout_url: "https://checkout.dodo.test/session-1" });
  });

  it("creates a checkout using server-owned product and user metadata", async () => {
    const res = response();

    await handler(request(validBody), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ checkout_url: "https://checkout.dodo.test/session-1" });
    expect(mocks.createCheckout).toHaveBeenCalledWith({
      product_cart: [{ product_id: "prod-wanderer", quantity: 1 }],
      metadata: { supabase_uid: "user-1", plan: "wanderer" },
      return_url: validBody.returnUrl,
      cancel_url: validBody.cancelUrl,
    });
  });

  it("rejects unauthenticated checkout attempts", async () => {
    const res = response();

    await handler(request(validBody, ""), res);

    expect(res.statusCode).toBe(401);
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it("rejects unknown products and off-site redirects", async () => {
    const invalidPlan = response();
    await handler(request({ ...validBody, plan: "free-forever" }), invalidPlan);
    expect(invalidPlan.statusCode).toBe(400);

    const invalidRedirect = response();
    await handler(
      request({ ...validBody, returnUrl: "https://attacker.example/paid" }),
      invalidRedirect,
    );
    expect(invalidRedirect.statusCode).toBe(400);
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it("does not report success when Dodo cannot create checkout", async () => {
    mocks.createCheckout.mockRejectedValue(new Error("processor unavailable"));
    const res = response();

    await handler(request(validBody), res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: "Checkout unavailable. Please try again." });
  });
});

describe("Pro pass checkout", () => {
  const passBody = { ...validBody, plan: "pass_3day" };
  let subscriptionRow: unknown = null;
  const from = vi.fn((table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: table === "subscriptions" ? subscriptionRow : null,
          error: null,
        }),
      })),
    })),
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    subscriptionRow = null;
    Object.assign(process.env, {
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      DODO_PAYMENTS_API_KEY: "dodo-key",
      DODO_ENVIRONMENT: "test_mode",
      DODO_PRODUCT_WANDERER: "prod-wanderer",
      DODO_PRODUCT_CARTOGRAPHER: "prod-cartographer",
      DODO_PRODUCT_PIONEER: "prod-pioneer",
      DODO_PRODUCT_TOPUP: "prod-topup",
      DODO_PRODUCT_PASS_3DAY: "prod-pass",
      APP_DOMAIN: "app.example.com",
    });
    mocks.createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      },
      from,
    });
    mocks.createCheckout.mockResolvedValue({ checkout_url: "https://checkout.dodo.test/pass-1" });
  });

  it("creates a one-time checkout for the pass product, tied to the signed-in user", async () => {
    const res = response();

    await handler(request(passBody), res);

    expect(res.statusCode).toBe(200);
    expect(mocks.createCheckout).toHaveBeenCalledWith({
      product_cart: [{ product_id: "prod-pass", quantity: 1 }],
      metadata: { supabase_uid: "user-1", plan: "pass_3day" },
      return_url: passBody.returnUrl,
      cancel_url: passBody.cancelUrl,
    });
  });

  it("ignores a quantity sent by the client", async () => {
    await handler(request({ ...passBody, quantity: 50 }), response());

    expect(mocks.createCheckout.mock.calls[0][0].product_cart).toEqual([{ product_id: "prod-pass", quantity: 1 }]);
  });

  it("requires sign-in", async () => {
    const res = response();

    await handler(request(passBody, ""), res);

    expect(res.statusCode).toBe(401);
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it("refuses a pass for a user with an active Wanderer subscription", async () => {
    subscriptionRow = { tier: "wanderer", status: "active", renewal_date: "2099-01-01" };
    const res = response();

    await handler(request(passBody), res);

    expect(res.statusCode).toBe(409);
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it("sells a pass to a subscriber whose cancelled period has ended", async () => {
    subscriptionRow = { tier: "wanderer", status: "cancelling", renewal_date: "2000-01-01" };
    const res = response();

    await handler(request(passBody), res);

    expect(res.statusCode).toBe(200);
  });

  it("is unavailable when the pass product is not configured, without breaking other plans", async () => {
    delete process.env.DODO_PRODUCT_PASS_3DAY;

    const pass = response();
    await handler(request(passBody), pass);
    expect(pass.statusCode).toBe(500);
    expect(mocks.createCheckout).not.toHaveBeenCalled();

    const wanderer = response();
    await handler(request(validBody), wanderer);
    expect(wanderer.statusCode).toBe(200);
  });
});

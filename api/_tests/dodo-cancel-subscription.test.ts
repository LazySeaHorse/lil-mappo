// @vitest-environment node

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  cancelSubscription: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("dodopayments", () => ({
  default: class MockDodoPayments {
    subscriptions = { update: mocks.cancelSubscription };
  },
}));

import handler from "../dodo-cancel-subscription.js";

function request() {
  return {
    method: "POST",
    headers: { authorization: "Bearer valid-token" },
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

function clients(subscription: { dodo_subscription_id: string; tier: string } | null) {
  const getUser = vi.fn().mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
  const maybeSingle = vi.fn().mockResolvedValue({ data: subscription, error: null });
  const selectBuilder = {
    select: vi.fn(() => ({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn(() => ({ maybeSingle })),
      }),
    })),
  };
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const admin = {
    from: vi.fn(() => ({
      ...selectBuilder,
      update: vi.fn(() => ({ eq: updateEq })),
    })),
  };
  mocks.createClient
    .mockReturnValueOnce({ auth: { getUser } })
    .mockReturnValueOnce(admin);
  return { admin, updateEq };
}

describe("subscription cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(process.env, {
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      DODO_PAYMENTS_API_KEY: "dodo-key",
      DODO_ENVIRONMENT: "test_mode",
    });
    mocks.cancelSubscription.mockResolvedValue({});
  });

  it("schedules cancellation and preserves access as cancelling", async () => {
    const { updateEq } = clients({ dodo_subscription_id: "sub-1", tier: "wanderer" });
    const res = response();

    await handler(request(), res);

    expect(mocks.cancelSubscription).toHaveBeenCalledWith("sub-1", {
      cancel_at_next_billing_date: true,
      cancel_reason: "cancelled_by_customer",
    });
    expect(updateEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(res.body).toEqual({ success: true });
  });

  it("does not change local entitlement when provider cancellation fails", async () => {
    const { updateEq } = clients({ dodo_subscription_id: "sub-1", tier: "wanderer" });
    mocks.cancelSubscription.mockRejectedValue(new Error("provider failure"));
    const res = response();

    await handler(request(), res);

    expect(res.statusCode).toBe(502);
    expect(updateEq).not.toHaveBeenCalled();
  });

  it("returns not found when the user has no active subscription", async () => {
    clients(null);
    const res = response();

    await handler(request(), res);

    expect(res.statusCode).toBe(404);
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
  });
});

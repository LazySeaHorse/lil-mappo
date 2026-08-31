// @vitest-environment node

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BillingService, toDateString } from "../_lib/dodo/billingService.js";
import { normalizeHeaders } from "../_lib/dodo/verify.js";

describe("Dodo BillingService unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts ISO strings to YYYY-MM-DD correctly", () => {
    expect(toDateString("2026-08-31T12:34:56Z")).toBe("2026-08-31");
    expect(toDateString(null)).toBeNull();
    expect(toDateString(undefined)).toBeNull();
  });

  it("normalizes HTTP headers correctly", () => {
    const headers = {
      "webhook-signature": ["sig1", "sig2"],
      "content-type": "application/json",
      "x-empty": undefined,
    };
    const normalized = normalizeHeaders(headers);
    expect(normalized).toEqual({
      "webhook-signature": "sig1",
      "content-type": "application/json",
    });
  });

  it("sets subscription to cancelling when user cancels", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const supabase = { from } as unknown as SupabaseClient;

    const service = new BillingService(supabase);
    await service.cancelSubscription({
      subscription_id: "sub_123",
      product_id: "prod_1",
    });

    expect(from).toHaveBeenCalledWith("subscriptions");
    expect(update).toHaveBeenCalledWith({ status: "cancelling" });
    expect(eq).toHaveBeenCalledWith("dodo_subscription_id", "sub_123");
  });

  it("marks subscription status as on_hold or failed", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const supabase = { from } as unknown as SupabaseClient;

    const service = new BillingService(supabase);
    await service.setSubscriptionUnavailable(
      { subscription_id: "sub_hold", product_id: "prod_1" },
      "on_hold"
    );

    expect(update).toHaveBeenCalledWith({ status: "on_hold" });
  });

  it("restores dunning recovered subscription to active", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const supabase = { from } as unknown as SupabaseClient;

    const service = new BillingService(supabase);
    await service.recoverDunning({ subscription_id: "sub_recovered" });

    expect(update).toHaveBeenCalledWith({ status: "active" });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Subscription } from "./database.types";

vi.mock("react-secure-storage", () => ({
  default: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

import {
  getExportLimits,
  isFreeUser,
  isMapLoadTracked,
  isWanderer,
  brandingFor,
} from "./cloudAccess";
import { isWanderer as serverIsWanderer } from "../../api/_lib/entitlement";

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    user_id: "user-1",
    tier: "wanderer",
    monthly_credits: 100,
    parallel_renders: 1,
    renewal_date: "2026-09-30",
    dodo_subscription_id: "sub-1",
    status: "active",
    created_at: "2026-08-30T00:00:00Z",
    updated_at: "2026-08-30T00:00:00Z",
    ...overrides,
  };
}

describe("subscription entitlements", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("grants paid features to an active Wanderer subscription", () => {
    const active = subscription();

    expect(isFreeUser(active)).toBe(false);
    expect(brandingFor(active)).toBe('paid');
    expect(getExportLimits(active).limited).toBe(false);
    expect(isMapLoadTracked(active)).toBe(false);
  });

  it("keeps features through the cancellation date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
    const cancelling = subscription({ status: "cancelling" });

    expect(isFreeUser(cancelling)).toBe(false);
    expect(brandingFor(cancelling)).toBe('paid');
  });

  it("removes features after the cancellation period even if the expiry webhook is delayed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T00:00:01Z"));
    const cancelling = subscription({ status: "cancelling" });

    expect(isFreeUser(cancelling)).toBe(true);
    expect(brandingFor(cancelling)).toBe('free');
    expect(getExportLimits(cancelling).limited).toBe(true);
    expect(isMapLoadTracked(cancelling)).toBe(true);
  });

  it.each(["on_hold", "failed", "expired", "cancelled"] as const)(
    "does not grant paid features when status is %s",
    (status) => {
      expect(isFreeUser(subscription({ status }))).toBe(true);
    },
  );

  it("fails closed when a cancelling subscription has no period-end date", () => {
    expect(isFreeUser(subscription({ status: "cancelling", renewal_date: null }))).toBe(true);
  });
});

describe("isWanderer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is the paid-plan check: active, or cancelling through the renewal date (UTC)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T23:59:59Z"));

    expect(isWanderer(subscription())).toBe(true);
    expect(isWanderer(subscription({ status: "cancelling" }))).toBe(true);
    expect(isWanderer(subscription({ status: "cancelling", renewal_date: "2026-09-29" }))).toBe(false);
    expect(isWanderer(subscription({ status: "cancelling", renewal_date: null }))).toBe(false);
    expect(isWanderer(subscription({ status: "on_hold" }))).toBe(false);
    expect(isWanderer(subscription({ tier: "cartographer" }))).toBe(false);
    expect(isWanderer(null)).toBe(false);
    expect(isWanderer(undefined)).toBe(false);
  });

  it("does not look at renewal_date for an active subscription", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));

    expect(isWanderer(subscription({ renewal_date: "2026-09-30" }))).toBe(true);
    expect(isWanderer(subscription({ renewal_date: null }))).toBe(true);
  });
});

// api/ cannot import src/, so the server keeps its own copy of the paid-plan
// rules. Run both against one table so they cannot drift apart.
describe("isWanderer matches the server entitlement check (api/_lib/entitlement.ts)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const NOW = "2026-09-30T23:59:59Z";
  const table: Array<[string, Subscription | null | undefined]> = [
    ["no subscription (null)", null],
    ["no subscription (undefined)", undefined],
    ["active", subscription()],
    ["active, renewal date passed", subscription({ renewal_date: "2026-01-01" })],
    ["active, no renewal date", subscription({ renewal_date: null })],
    ["cancelling, ends today", subscription({ status: "cancelling", renewal_date: "2026-09-30" })],
    ["cancelling, ends later", subscription({ status: "cancelling", renewal_date: "2026-10-30" })],
    ["cancelling, ended yesterday", subscription({ status: "cancelling", renewal_date: "2026-09-29" })],
    ["cancelling, no end date", subscription({ status: "cancelling", renewal_date: null })],
    ["on_hold", subscription({ status: "on_hold" })],
    ["failed", subscription({ status: "failed" })],
    ["expired", subscription({ status: "expired" })],
    ["cancelled", subscription({ status: "cancelled" })],
    ["other tier, active", subscription({ tier: "cartographer" })],
    ["other tier, cancelling", subscription({ tier: "pioneer", status: "cancelling" })],
  ];

  it.each(table)("%s", (_label, sub) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));

    expect(serverIsWanderer(sub)).toBe(isWanderer(sub));
  });
});

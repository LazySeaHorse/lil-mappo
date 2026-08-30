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
  shouldShowWatermark,
} from "./cloudAccess";

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
    expect(shouldShowWatermark(active)).toBe(false);
    expect(getExportLimits(active).limited).toBe(false);
    expect(isMapLoadTracked(active)).toBe(false);
  });

  it("keeps features through the cancellation date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
    const cancelling = subscription({ status: "cancelling" });

    expect(isFreeUser(cancelling)).toBe(false);
    expect(shouldShowWatermark(cancelling)).toBe(false);
  });

  it("removes features after the cancellation period even if the expiry webhook is delayed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T00:00:01Z"));
    const cancelling = subscription({ status: "cancelling" });

    expect(isFreeUser(cancelling)).toBe(true);
    expect(shouldShowWatermark(cancelling)).toBe(true);
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

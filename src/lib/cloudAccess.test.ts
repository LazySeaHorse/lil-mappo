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
  canCloudSave,
  hasActiveSubscription,
  activePassEnd,
} from "./cloudAccess";
import { withProPass } from "./proPass";
import {
  isWanderer as serverIsWanderer,
  withProPass as serverWithProPass,
} from "../../api/_lib/entitlement";

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

/** A user with a pass and no subscription, as both sides merge it. */
function passRow(passExpiresAt: string | null): Subscription {
  return subscription({
    status: "none",
    renewal_date: null,
    dodo_subscription_id: null,
    pass_expires_at: passExpiresAt,
  });
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

describe("Pro pass", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** The row useSubscription builds for a user who has a pass but no subscription. */
  function passOnly(passExpiresAt: string): Subscription {
    return subscription({
      status: "none",
      renewal_date: null,
      dodo_subscription_id: null,
      monthly_credits: 0,
      parallel_renders: 0,
      pass_expires_at: passExpiresAt,
    });
  }

  it("unlocks every paid gate while the pass is active", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
    const pass = passOnly("2026-10-21T12:00:00Z");

    expect(isWanderer(pass)).toBe(true);
    expect(isFreeUser(pass)).toBe(false);
    expect(brandingFor(pass)).toBe("paid");
    expect(getExportLimits(pass).limited).toBe(false);
    expect(isMapLoadTracked(pass)).toBe(false);
    expect(canCloudSave(pass, 10)).toBe(true);
  });

  it("locks the gates again the moment the pass ends", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
    const pass = passOnly("2026-10-21T12:00:00Z");

    expect(isWanderer(pass)).toBe(false);
    expect(brandingFor(pass)).toBe("free");
    expect(getExportLimits(pass).limited).toBe(true);
    expect(canCloudSave(pass, 10)).toBe(false);
  });

  it("is not a subscription: hasActiveSubscription ignores the pass", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));

    expect(hasActiveSubscription(passOnly("2026-10-21T12:00:00Z"))).toBe(false);
    expect(hasActiveSubscription(subscription())).toBe(true);
    expect(hasActiveSubscription(subscription({ pass_expires_at: "2026-10-21T12:00:00Z" }))).toBe(true);
  });

  it("reports when an active pass ends, and nothing for an ended or missing pass", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));

    expect(activePassEnd(passOnly("2026-10-21T12:00:00Z"))?.toISOString()).toBe("2026-10-21T12:00:00.000Z");
    expect(activePassEnd(passOnly("2026-10-18T11:59:59Z"))).toBeNull();
    expect(activePassEnd(passOnly("not a date"))).toBeNull();
    expect(activePassEnd(subscription())).toBeNull();
    expect(activePassEnd(null)).toBeNull();
  });

  it("keeps a subscriber paid when their old pass has ended", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
    expect(isWanderer(subscription({ pass_expires_at: "2026-10-01T00:00:00Z" }))).toBe(true);
  });

  it("keeps a lapsed subscriber paid while a pass is active", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
    const lapsed = subscription({
      status: "cancelling",
      renewal_date: "2026-10-01",
      pass_expires_at: "2026-10-20T00:00:00Z",
    });

    expect(hasActiveSubscription(lapsed)).toBe(false);
    expect(isWanderer(lapsed)).toBe(true);
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
    // Pro pass (pass_expires_at, from public.pro_passes). NOW is 2026-09-30T23:59:59Z.
    ["pass only, active", passRow("2026-10-03T23:59:59Z")],
    ["pass only, ends in one second", passRow("2026-10-01T00:00:00Z")],
    ["pass only, ends exactly now", passRow("2026-09-30T23:59:59Z")],
    ["pass only, ended", passRow("2026-09-29T00:00:00Z")],
    ["pass only, unreadable date", passRow("soon")],
    ["pass only, no expiry", passRow(null)],
    ["active subscription, ended pass", subscription({ pass_expires_at: "2026-09-01T00:00:00Z" })],
    ["active subscription, active pass (stacked)", subscription({ pass_expires_at: "2026-10-03T00:00:00Z" })],
    ["cancelling past its end, active pass", subscription({ status: "cancelling", renewal_date: "2026-09-29", pass_expires_at: "2026-10-03T00:00:00Z" })],
    ["cancelling past its end, ended pass", subscription({ status: "cancelling", renewal_date: "2026-09-29", pass_expires_at: "2026-09-30T00:00:00Z" })],
    ["on_hold, active pass", subscription({ status: "on_hold", pass_expires_at: "2026-10-03T00:00:00Z" })],
    ["other tier, active pass", subscription({ tier: "cartographer", status: "on_hold", pass_expires_at: "2026-10-03T00:00:00Z" })],
  ];

  it.each(table)("%s", (_label, sub) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));

    expect(serverIsWanderer(sub)).toBe(isWanderer(sub));
  });

  it("covers both outcomes for the pass rows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const results = table.filter(([label]) => label.includes("pass")).map(([, sub]) => isWanderer(sub));
    expect(results).toContain(true);
    expect(results).toContain(false);
  });

  it("merges a pass into the subscription the same way on both sides", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const sub = subscription({ status: "on_hold" });

    expect(serverWithProPass(sub, "2026-10-03T00:00:00Z")).toMatchObject({ status: "on_hold", pass_expires_at: "2026-10-03T00:00:00Z" });
    expect(withProPass(sub, "2026-10-03T00:00:00Z", "user-1")).toMatchObject({ status: "on_hold", pass_expires_at: "2026-10-03T00:00:00Z" });
    expect(serverWithProPass(null, "2026-10-03T00:00:00Z")).toMatchObject({ status: "none", pass_expires_at: "2026-10-03T00:00:00Z" });
    expect(withProPass(null, "2026-10-03T00:00:00Z", "user-1")).toMatchObject({ status: "none", pass_expires_at: "2026-10-03T00:00:00Z" });
    expect(serverWithProPass(null, null)).toBeNull();
    expect(withProPass(null, null, "user-1")).toBeNull();
  });
});

// @vitest-environment node

import { describe, expect, it } from "vitest";
import { hasActiveMapEntitlement } from "./track-map-load";

describe("server-side subscription entitlement", () => {
  it("allows active Wanderer subscriptions", () => {
    expect(
      hasActiveMapEntitlement(
        { tier: "wanderer", status: "active", renewal_date: "2026-09-30" },
        "2026-10-01",
      ),
    ).toBe(true);
  });

  it("allows cancelling subscriptions through their period end", () => {
    expect(
      hasActiveMapEntitlement(
        { tier: "wanderer", status: "cancelling", renewal_date: "2026-09-30" },
        "2026-09-30",
      ),
    ).toBe(true);
  });

  it("denies cancelling subscriptions after their period end", () => {
    expect(
      hasActiveMapEntitlement(
        { tier: "wanderer", status: "cancelling", renewal_date: "2026-09-30" },
        "2026-10-01",
      ),
    ).toBe(false);
  });

  it.each(["on_hold", "failed", "expired", "cancelled"])(
    "denies subscriptions in %s state",
    (status) => {
      expect(
        hasActiveMapEntitlement(
          { tier: "wanderer", status, renewal_date: "2026-09-30" },
          "2026-09-01",
        ),
      ).toBe(false);
    },
  );
});

// @vitest-environment node

import { describe, expect, it } from "vitest";
import { isWanderer } from "../_lib/entitlement.js";

describe("server-side subscription entitlement", () => {
  it("allows active Wanderer subscriptions", () => {
    expect(
      isWanderer(
        { tier: "wanderer", status: "active", renewal_date: "2026-09-30" },
        "2026-10-01",
      ),
    ).toBe(true);
  });

  it("allows cancelling subscriptions through their period end", () => {
    expect(
      isWanderer(
        { tier: "wanderer", status: "cancelling", renewal_date: "2026-09-30" },
        "2026-09-30",
      ),
    ).toBe(true);
  });

  it("denies cancelling subscriptions after their period end", () => {
    expect(
      isWanderer(
        { tier: "wanderer", status: "cancelling", renewal_date: "2026-09-30" },
        "2026-10-01",
      ),
    ).toBe(false);
  });

  it("denies cancelling subscriptions with no period end", () => {
    expect(
      isWanderer(
        { tier: "wanderer", status: "cancelling", renewal_date: null },
        "2026-09-01",
      ),
    ).toBe(false);
  });

  it("denies other tiers and missing subscriptions", () => {
    expect(
      isWanderer(
        { tier: "cartographer", status: "active", renewal_date: "2026-09-30" },
        "2026-09-01",
      ),
    ).toBe(false);
    expect(isWanderer(null, "2026-09-01")).toBe(false);
    expect(isWanderer(undefined, "2026-09-01")).toBe(false);
  });

  it.each(["on_hold", "failed", "expired", "cancelled"])(
    "denies subscriptions in %s state",
    (status) => {
      expect(
        isWanderer(
          { tier: "wanderer", status, renewal_date: "2026-09-30" },
          "2026-09-01",
        ),
      ).toBe(false);
    },
  );
});

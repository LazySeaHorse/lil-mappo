// @vitest-environment node

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { isWanderer, loadEntitlement, withProPass } from "../_lib/entitlement.js";

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

describe("server-side Pro pass entitlement", () => {
  const NOW = Date.parse("2026-10-18T12:00:00Z");
  const TODAY = "2026-10-18";

  it("allows a pass-only user until the pass ends", () => {
    const pass = { tier: "wanderer", status: "none", renewal_date: null, pass_expires_at: "2026-10-21T12:00:00Z" };
    expect(isWanderer(pass, TODAY, NOW)).toBe(true);
    expect(isWanderer(pass, "2026-10-21", Date.parse("2026-10-21T12:00:00Z"))).toBe(false);
  });

  it("keeps a lapsed subscriber entitled while their pass is active", () => {
    expect(
      isWanderer(
        { tier: "wanderer", status: "on_hold", renewal_date: "2026-10-01", pass_expires_at: "2026-10-19T00:00:00Z" },
        TODAY,
        NOW,
      ),
    ).toBe(true);
  });

  it("does not let an ended pass downgrade an active subscription", () => {
    expect(
      isWanderer(
        { tier: "wanderer", status: "active", renewal_date: "2026-11-01", pass_expires_at: "2026-10-01T00:00:00Z" },
        TODAY,
        NOW,
      ),
    ).toBe(true);
  });

  it("merges a pass row into the subscription row without changing the subscription", () => {
    const sub = { tier: "wanderer", status: "active", renewal_date: "2026-11-01" };
    expect(withProPass(sub, "2026-10-21T12:00:00Z")).toEqual({ ...sub, pass_expires_at: "2026-10-21T12:00:00Z" });
    expect(withProPass(null, "2026-10-21T12:00:00Z")).toEqual({
      tier: "wanderer",
      status: "none",
      renewal_date: null,
      pass_expires_at: "2026-10-21T12:00:00Z",
    });
    expect(withProPass(null, null)).toBeNull();
    expect(withProPass(sub, null)).toEqual({ ...sub, pass_expires_at: null });
  });
});

describe("loadEntitlement", () => {
  function db(sub: unknown, pass: unknown, errors: { sub?: unknown; pass?: unknown } = {}) {
    const from = vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue(
            table === "subscriptions"
              ? { data: sub, error: errors.sub ?? null }
              : { data: pass, error: errors.pass ?? null },
          ),
        })),
      })),
    }));
    return { from } as unknown as SupabaseClient & { from: typeof from };
  }

  it("reads the subscription and the pass for the user and merges them", async () => {
    const client = db(null, { expires_at: "2026-10-21T12:00:00Z" });
    const { data, error } = await loadEntitlement(client, "user-1");

    expect(error).toBeNull();
    expect(data).toEqual({ tier: "wanderer", status: "none", renewal_date: null, pass_expires_at: "2026-10-21T12:00:00Z" });
    expect(client.from).toHaveBeenCalledWith("subscriptions");
    expect(client.from).toHaveBeenCalledWith("pro_passes");
  });

  it("reports a database error instead of guessing", async () => {
    const { data, error } = await loadEntitlement(db(null, null, { pass: { message: "down" } }), "user-1");
    expect(error).toEqual({ message: "down" });
    expect(data).toBeNull();
  });
});

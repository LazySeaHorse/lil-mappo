// @vitest-environment node

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import handler from "../track-map-load.js";

function request() {
  return { method: "POST", headers: { authorization: "Bearer valid-token" } } as unknown as VercelRequest;
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

function admin(subscription: unknown, pass: unknown) {
  const rpc = vi.fn().mockResolvedValue({
    data: [{ allowed: true, reason: null, monthly_total: 1, daily_total: 1 }],
    error: null,
  });
  mocks.createClient.mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: table === "pro_passes" ? pass : subscription,
            error: null,
          }),
        })),
      })),
    })),
    rpc,
  });
  return rpc;
}

describe("track-map-load quota", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    mocks.createClient.mockReset();
  });

  it("does not count loads for a Pro pass holder", async () => {
    const rpc = admin(null, { expires_at: "2026-10-21T12:00:00Z" });
    const res = response();

    await handler(request(), res);

    expect(res.body).toEqual({ allowed: true, monthly_total: 0, daily_total: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("counts loads again once the pass has ended", async () => {
    const rpc = admin(null, { expires_at: "2026-10-18T11:00:00Z" });

    await handler(request(), response());

    expect(rpc).toHaveBeenCalledWith("track_map_load", { p_user_id: "user-1" });
  });

  it("does not count loads for an active subscriber", async () => {
    const rpc = admin({ tier: "wanderer", status: "active", renewal_date: "2026-11-01" }, null);

    await handler(request(), response());

    expect(rpc).not.toHaveBeenCalled();
  });
});

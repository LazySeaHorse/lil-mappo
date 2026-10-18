// @vitest-environment node

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import handler from "../render-dispatch.js";

type Sub = { tier: string; status: string; renewal_date: string | null } | null;

function request() {
  return {
    method: "POST",
    headers: { authorization: "Bearer valid-token" },
    body: {
      projectData: { duration: 10 },
      renderConfig: { exportResolution: "1080p", fps: 30, aspectRatio: "16:9", isVertical: false },
      startTime: 0,
      endTime: 10,
    },
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

/** Wires the user + admin clients; returns the rpc mock to inspect the stored render config. */
function clients(subscription: Sub, passExpiresAt: string | null = null) {
  const userClient = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
  };
  const rpc = vi.fn(async (name: string) => {
    if (name === "deduct_render_credits") {
      return { data: [{ monthly_charged: 1, purchased_charged: 0 }], error: null };
    }
    if (name === "create_render_job") return { data: { job_id: "job-1" }, error: null };
    return { data: null, error: null };
  });
  const admin = {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: table === "pro_passes" ? (passExpiresAt ? { expires_at: passExpiresAt } : null) : subscription,
            error: null,
          }),
        })),
      })),
    })),
    rpc,
  };
  mocks.createClient.mockImplementation((_url: string, key: string) =>
    key === process.env.SUPABASE_SERVICE_ROLE_KEY ? admin : userClient,
  );
  return rpc;
}

async function storedWatermark(subscription: Sub, passExpiresAt: string | null = null) {
  const rpc = clients(subscription, passExpiresAt);
  const res = response();
  await handler(request(), res);
  expect(res.statusCode).toBe(200);
  const call = rpc.mock.calls.find(([name]) => name === "create_render_job") as unknown as
    [string, { p_render_config: { showWatermark: boolean } }];
  return call[1].p_render_config.showWatermark;
}

describe("render-dispatch watermark entitlement", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubEnv("MODAL_WEBHOOK_URL", "https://modal.example/dispatch");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    mocks.createClient.mockReset();
  });

  it("does not watermark an active Wanderer", async () => {
    expect(
      await storedWatermark({ tier: "wanderer", status: "active", renewal_date: "2026-09-30" }),
    ).toBe(false);
  });

  it("does not watermark a cancelling Wanderer still in its paid period", async () => {
    expect(
      await storedWatermark({ tier: "wanderer", status: "cancelling", renewal_date: "2026-10-01" }),
    ).toBe(false);
  });

  it("watermarks a cancelling Wanderer whose paid period has ended", async () => {
    expect(
      await storedWatermark({ tier: "wanderer", status: "cancelling", renewal_date: "2026-09-30" }),
    ).toBe(true);
  });

  it("watermarks a cancelling Wanderer with no period end", async () => {
    expect(
      await storedWatermark({ tier: "wanderer", status: "cancelling", renewal_date: null }),
    ).toBe(true);
  });

  it("watermarks a free user", async () => {
    expect(await storedWatermark(null)).toBe(true);
  });

  it("does not watermark a user with an active Pro pass", async () => {
    expect(await storedWatermark(null, "2026-10-04T12:00:00Z")).toBe(false);
  });

  it("watermarks a user whose Pro pass has ended", async () => {
    expect(await storedWatermark(null, "2026-10-01T11:59:59Z")).toBe(true);
  });
});

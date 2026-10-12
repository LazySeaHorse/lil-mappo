import { createHash } from "node:crypto";
import { PostHog } from "posthog-node";

/** Upper bound for the whole capture, so analytics can never delay the webhook response (Dodo retries slow endpoints). */
const CAPTURE_TIMEOUT_MS = 1500;

const POSTHOG_EU_HOST = "https://eu.i.posthog.com";

export interface ServerEvent {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
  /** Deterministic id so a retried delivery de-duplicates in PostHog. */
  uuid?: string;
  /** When the event actually happened (e.g. the webhook timestamp). */
  timestamp?: Date;
}

export function isServerAnalyticsEnabled(): boolean {
  return !!process.env.VITE_POSTHOG_KEY?.trim();
}

/** Live Dodo payments are "production"; test mode shares the preview environment. */
export function serverEnvironment(): "production" | "preview" {
  return process.env.DODO_ENVIRONMENT === "live_mode" ? "production" : "preview";
}

/**
 * Stable UUID (v5-style) derived from an arbitrary string, for PostHog's `uuid`
 * field, which must be a valid UUID.
 */
export function deterministicUuid(seed: string): string {
  const bytes = createHash("sha1").update(`lil-mappo:${seed}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Sends one event to PostHog EU and waits for it, because a serverless function
 * may be frozen right after responding. A no-op without VITE_POSTHOG_KEY. Never
 * throws and never takes longer than CAPTURE_TIMEOUT_MS.
 */
export async function captureServerEvent(message: ServerEvent): Promise<void> {
  const key = process.env.VITE_POSTHOG_KEY?.trim();
  if (!key) return;

  let client: PostHog | undefined;
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const active = new PostHog(key, {
      host: POSTHOG_EU_HOST,
      flushAt: 1,
      flushInterval: 0,
      disableGeoip: true,
    });
    client = active;
    const work = (async () => {
      await active.captureImmediate({
        distinctId: message.distinctId,
        event: message.event,
        properties: { environment: serverEnvironment(), ...message.properties },
        uuid: message.uuid,
        timestamp: message.timestamp,
      });
      await active.shutdown();
      finished = true;
    })();
    // If the timeout wins, the capture keeps running in the background; swallow its late failure.
    work.catch(() => undefined);
    await Promise.race([
      work,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, CAPTURE_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    console.warn("[analytics] server capture failed:", err instanceof Error ? err.message : "unknown error");
  } finally {
    if (timer) clearTimeout(timer);
    // Timed out or failed: release timers/sockets without waiting.
    if (!finished) void client?.shutdown().catch(() => undefined);
  }
}

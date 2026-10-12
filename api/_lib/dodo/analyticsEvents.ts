import type { IncomingHttpHeaders } from "node:http";
import type { SupabaseClient } from "@supabase/supabase-js";
import { captureServerEvent, deterministicUuid, isServerAnalyticsEnabled } from "../analytics.js";
import type { DispatchResult, SubEventData, WebhookEvent } from "./types.js";

export interface SubscriptionOwner {
  userId: string;
  tier: string;
}

const TRACKED_LOOKUP_EVENTS = new Set(["subscription.cancelled", "subscription.expired"]);

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Finds who owns a subscription. Must run BEFORE the handler for expirations,
 * which delete the row. Only done when analytics is enabled; never throws.
 */
export async function lookupSubscriptionOwner(
  supabase: SupabaseClient,
  event: WebhookEvent,
): Promise<SubscriptionOwner | null> {
  if (!isServerAnalyticsEnabled() || !TRACKED_LOOKUP_EVENTS.has(event.type)) return null;
  try {
    const subscriptionId = (event.data as SubEventData).subscription_id;
    const { data } = await supabase
      .from("subscriptions")
      .select("user_id, tier")
      .eq("dodo_subscription_id", subscriptionId)
      .maybeSingle();
    return data ? { userId: data.user_id as string, tier: data.tier as string } : null;
  } catch {
    return null;
  }
}

/**
 * Reports subscription lifecycle events to PostHog after the webhook handler
 * succeeded. The uuid and timestamp come from the webhook headers so a
 * redelivered webhook cannot create a duplicate event. Never throws.
 */
export async function reportSubscriptionEvent(args: {
  event: WebhookEvent;
  result: DispatchResult;
  owner: SubscriptionOwner | null;
  headers: IncomingHttpHeaders;
}): Promise<void> {
  if (!isServerAnalyticsEnabled()) return;
  try {
    const { event, result, owner, headers } = args;
    const sub = event.data as SubEventData;

    let name: string | undefined;
    let userId: string | undefined;
    let tier: string | undefined;
    if (event.type === "subscription.active") {
      // A retried delivery re-runs provisioning; only the first one is a real new subscription.
      if (!result.provisioned?.firstTime) return;
      name = "subscription_started";
      userId = result.provisioned.userId;
      tier = result.provisioned.tier;
    } else if (event.type === "subscription.cancelled") {
      name = "subscription_cancelled";
    } else if (event.type === "subscription.expired") {
      name = "subscription_ended";
    }
    if (!name) return;
    userId ??= sub.metadata?.supabase_uid ?? owner?.userId;
    tier ??= owner?.tier;
    if (!userId) return;

    const webhookId = header(headers, "webhook-id");
    const seconds = Number(header(headers, "webhook-timestamp"));
    await captureServerEvent({
      distinctId: userId,
      event: name,
      properties: tier ? { tier } : {},
      uuid: webhookId ? deterministicUuid(`${webhookId}:${name}`) : undefined,
      timestamp: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : undefined,
    });
  } catch (err) {
    console.warn("[dodo-webhook] analytics reporting failed:", err instanceof Error ? err.message : "unknown error");
  }
}

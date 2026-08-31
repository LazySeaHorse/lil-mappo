import type { SupabaseClient } from "@supabase/supabase-js";
import { BillingService } from "./billingService.js";
import type { DunningEventData, PaymentEventData, Plans, SubEventData, WebhookEvent } from "./types.js";

function getBillingService(target: SupabaseClient | BillingService): BillingService {
  return target instanceof BillingService ? target : new BillingService(target);
}

export async function handleSubscriptionActive(
  sub: SubEventData,
  clientOrService: SupabaseClient | BillingService,
  plans: Plans
): Promise<void> {
  const plan = plans[sub.product_id];
  if (!plan) {
    console.warn("[dodo-webhook] subscription.active: unknown product_id:", sub.product_id);
    return;
  }
  const service = getBillingService(clientOrService);
  await service.provisionSubscription(sub, plan);
}

export async function handlePaymentSucceeded(
  payment: PaymentEventData,
  clientOrService: SupabaseClient | BillingService
): Promise<void> {
  const service = getBillingService(clientOrService);
  await service.creditTopupPayment(payment);
}

export async function handleSubscriptionRenewed(
  sub: SubEventData,
  clientOrService: SupabaseClient | BillingService,
  plans: Plans
): Promise<void> {
  const plan = plans[sub.product_id];
  const service = getBillingService(clientOrService);
  await service.renewSubscription(sub, plan);
}

export async function handleSubscriptionCancelled(
  sub: SubEventData,
  clientOrService: SupabaseClient | BillingService
): Promise<void> {
  const service = getBillingService(clientOrService);
  await service.cancelSubscription(sub);
}

export async function handleSubscriptionExpired(
  sub: SubEventData,
  clientOrService: SupabaseClient | BillingService
): Promise<void> {
  const service = getBillingService(clientOrService);
  await service.expireSubscription(sub);
}

export async function handleSubscriptionUnavailable(
  sub: SubEventData,
  clientOrService: SupabaseClient | BillingService,
  status: "on_hold" | "failed"
): Promise<void> {
  const service = getBillingService(clientOrService);
  await service.setSubscriptionUnavailable(sub, status);
}

export async function handleDunningRecovered(
  event: DunningEventData,
  clientOrService: SupabaseClient | BillingService
): Promise<void> {
  const service = getBillingService(clientOrService);
  await service.recoverDunning(event);
}

export async function dispatchWebhookEvent(
  event: WebhookEvent,
  clientOrService: SupabaseClient | BillingService,
  plans: Plans
): Promise<void> {
  switch (event.type) {
    case "subscription.active":
      await handleSubscriptionActive(event.data as SubEventData, clientOrService, plans);
      break;
    case "payment.succeeded":
      await handlePaymentSucceeded(event.data as PaymentEventData, clientOrService);
      break;
    case "subscription.renewed":
      await handleSubscriptionRenewed(event.data as SubEventData, clientOrService, plans);
      break;
    case "subscription.cancelled":
      await handleSubscriptionCancelled(event.data as SubEventData, clientOrService);
      break;
    case "subscription.expired":
      await handleSubscriptionExpired(event.data as SubEventData, clientOrService);
      break;
    case "subscription.on_hold":
      await handleSubscriptionUnavailable(event.data as SubEventData, clientOrService, "on_hold");
      break;
    case "subscription.failed":
      await handleSubscriptionUnavailable(event.data as SubEventData, clientOrService, "failed");
      break;
    case "dunning.recovered":
      await handleDunningRecovered(event.data as DunningEventData, clientOrService);
      break;
    default:
      // Payment failures and other informational events must not grant access.
      break;
  }
}

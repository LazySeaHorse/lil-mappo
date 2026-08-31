import type { SupabaseClient } from "@supabase/supabase-js";
import type { DunningEventData, PaymentEventData, PlanConfig, SubEventData } from "./types.js";

/** ISO timestamp → YYYY-MM-DD date string for Postgres `date` columns. */
export function toDateString(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.split("T")[0];
}

export class BillingService {
  constructor(private readonly supabase: SupabaseClient) {}

  async provisionSubscription(sub: SubEventData, plan: PlanConfig): Promise<void> {
    const uid = sub.metadata?.supabase_uid;
    if (!uid) {
      console.warn("[dodo-webhook] subscription.active: missing supabase_uid in metadata");
      return;
    }

    const renewalDate = toDateString(sub.next_billing_date);
    const eventKey = `subscription.active:${sub.subscription_id}`;

    // Upsert subscription row
    const { error: subError } = await this.supabase
      .from("subscriptions")
      .upsert(
        {
          user_id: uid,
          tier: plan.tier,
          monthly_credits: plan.monthlyCredits,
          parallel_renders: plan.parallelRenders,
          renewal_date: renewalDate,
          dodo_subscription_id: sub.subscription_id,
          status: "active",
        },
        { onConflict: "user_id" }
      );

    if (subError) {
      console.error("[dodo-webhook] Failed to upsert subscription:", subError);
      throw new Error("DB error writing subscription");
    }

    // Update credit_balance — preserve purchased_credits (never reset those)
    const { data: existingBalance } = await this.supabase
      .from("credit_balance")
      .select("purchased_credits")
      .eq("user_id", uid)
      .maybeSingle();

    let creditError;
    if (existingBalance) {
      ({ error: creditError } = await this.supabase
        .from("credit_balance")
        .update({ monthly_credits: plan.monthlyCredits, monthly_reset_date: renewalDate })
        .eq("user_id", uid));
    } else {
      // Row should always exist (created by DB trigger on sign-up),
      // but handle gracefully if it somehow doesn't
      ({ error: creditError } = await this.supabase
        .from("credit_balance")
        .insert({
          user_id: uid,
          monthly_credits: plan.monthlyCredits,
          purchased_credits: 0,
          monthly_reset_date: renewalDate,
        }));
    }

    if (creditError) {
      console.error("[dodo-webhook] Failed to update credit_balance:", creditError);
      throw new Error("DB error writing credits");
    }

    // Idempotency key written LAST — after all work is complete.
    const { error: idempotencyError } = await this.supabase
      .from("processed_webhook_events")
      .insert({ event_key: eventKey });

    if (idempotencyError && idempotencyError.code !== "23505") {
      console.error("[dodo-webhook] Failed to record activation idempotency key:", idempotencyError);
      throw new Error("DB error recording event");
    }

    console.log("[dodo-webhook] Provisioned subscription for user", uid, "→", plan.tier);
  }

  async creditTopupPayment(payment: PaymentEventData): Promise<void> {
    if (payment.metadata?.plan !== "topup") return;

    const uid = payment.metadata?.supabase_uid;
    const credits = Number(payment.metadata?.credits ?? 0);

    if (!uid) {
      console.warn("[dodo-webhook] payment.succeeded (topup): missing supabase_uid");
      return;
    }
    if (credits <= 0) {
      console.warn("[dodo-webhook] payment.succeeded (topup): invalid credits value:", payment.metadata?.credits);
      return;
    }

    // Idempotency guard — insert payment_id; if already exists this is a duplicate retry
    const { error: idempotencyError } = await this.supabase
      .from("processed_payments")
      .insert({ payment_id: payment.payment_id });

    if (idempotencyError) {
      if (idempotencyError.code === "23505") {
        console.log("[dodo-webhook] payment.succeeded (topup): duplicate event, skipping", payment.payment_id);
        return;
      }
      console.error("[dodo-webhook] Failed to record payment idempotency key:", idempotencyError);
      throw new Error("DB error recording payment");
    }

    // Atomic increment
    const { error: topupCreditError } = await this.supabase.rpc(
      "increment_purchased_credits",
      { p_user_id: uid, p_amount: credits }
    );

    if (topupCreditError) {
      console.error("[dodo-webhook] Failed to credit topup balance:", topupCreditError);
      // Roll back the idempotency key so Dodo can retry successfully.
      await this.supabase.from("processed_payments").delete().eq("payment_id", payment.payment_id);
      throw new Error("DB error writing credits");
    }

    console.log("[dodo-webhook] Added", credits, "purchased credits to user", uid);
  }

  async renewSubscription(sub: SubEventData, plan?: PlanConfig): Promise<void> {
    const renewalDate = toDateString(sub.next_billing_date);
    const eventKey = `subscription.renewed:${sub.subscription_id}:${renewalDate}`;

    const { error: renewalUpdateError } = await this.supabase
      .from("subscriptions")
      .update({ renewal_date: renewalDate, status: "active" })
      .eq("dodo_subscription_id", sub.subscription_id);

    if (renewalUpdateError) {
      console.error("[dodo-webhook] Failed to update subscription on renewal:", renewalUpdateError);
      throw new Error("DB error updating subscription");
    }

    // Reset monthly credits for the new billing period
    const uid = sub.metadata?.supabase_uid;
    if (uid && plan) {
      const { error: creditResetError } = await this.supabase
        .from("credit_balance")
        .update({ monthly_credits: plan.monthlyCredits, monthly_reset_date: renewalDate })
        .eq("user_id", uid);

      if (creditResetError) {
        console.error("[dodo-webhook] Failed to reset credits on renewal:", creditResetError);
        throw new Error("DB error resetting credits");
      }
    }

    // Idempotency key written LAST
    const { error: idempotencyError } = await this.supabase
      .from("processed_webhook_events")
      .insert({ event_key: eventKey });

    if (idempotencyError && idempotencyError.code !== "23505") {
      console.error("[dodo-webhook] Failed to record renewal idempotency key:", idempotencyError);
      throw new Error("DB error recording event");
    }

    console.log("[dodo-webhook] Renewed subscription", sub.subscription_id);
  }

  async cancelSubscription(sub: SubEventData): Promise<void> {
    const { error } = await this.supabase
      .from("subscriptions")
      .update({ status: "cancelling" })
      .eq("dodo_subscription_id", sub.subscription_id);

    if (error) {
      console.error("[dodo-webhook] Failed to update subscription on cancellation:", error);
      throw new Error("DB error cancelling subscription");
    }

    console.log("[dodo-webhook] Scheduled cancellation for subscription", sub.subscription_id);
  }

  async expireSubscription(sub: SubEventData): Promise<void> {
    const { data: expiringSub } = await this.supabase
      .from("subscriptions")
      .select("user_id, tier")
      .eq("dodo_subscription_id", sub.subscription_id)
      .maybeSingle();

    if (!expiringSub) {
      console.warn("[dodo-webhook] subscription.expired: no matching row for", sub.subscription_id);
      return;
    }

    const { error: deleteError } = await this.supabase
      .from("subscriptions")
      .delete()
      .eq("user_id", expiringSub.user_id);

    if (deleteError) {
      console.error("[dodo-webhook] Failed to delete expired subscription:", deleteError);
      throw new Error("DB error deleting subscription");
    }

    console.log(
      "[dodo-webhook] Expired", expiringSub.tier,
      "→ free tier (subscription row deleted) for user", expiringSub.user_id
    );
  }

  async setSubscriptionUnavailable(
    sub: SubEventData,
    status: "on_hold" | "failed"
  ): Promise<void> {
    const { error } = await this.supabase
      .from("subscriptions")
      .update({ status })
      .eq("dodo_subscription_id", sub.subscription_id);

    if (error) {
      console.error(`[dodo-webhook] Failed to mark subscription ${status}:`, error);
      throw new Error(`DB error marking subscription ${status}`);
    }
  }

  async recoverDunning(event: DunningEventData): Promise<void> {
    const { error } = await this.supabase
      .from("subscriptions")
      .update({ status: "active" })
      .eq("dodo_subscription_id", event.subscription_id);

    if (error) {
      console.error("[dodo-webhook] Failed to restore recovered subscription:", error);
      throw new Error("DB error restoring recovered subscription");
    }
  }
}

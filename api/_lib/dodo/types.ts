export interface PlanConfig {
  tier: string;
  monthlyCredits: number;
  parallelRenders: number;
}

export type Plans = Record<string, PlanConfig>;

export interface SubEventData {
  subscription_id: string;
  product_id: string;
  next_billing_date?: string | null;
  metadata?: Record<string, string | undefined> | null;
}

export interface PaymentEventData {
  payment_id: string;
  metadata?: Record<string, string | undefined> | null;
}

export interface DunningEventData {
  subscription_id: string;
}

export interface WebhookEvent<T = unknown> {
  type: string;
  data: T;
}

/** Result of provisioning an active subscription. `firstTime` is false for a retried delivery. */
export interface ProvisionResult {
  userId: string;
  firstTime: boolean;
}

/** What a dispatched webhook did, for callers that report it (analytics). */
export interface DispatchResult {
  provisioned?: ProvisionResult & { tier: string };
}

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
  /** Products bought in a one-time payment (set by Dodo, not by us). */
  product_cart?: Array<{ product_id: string; quantity?: number }> | null;
  /** Amount charged, in the currency's smallest unit (cents for USD). */
  total_amount?: number;
  currency?: string;
  status?: string | null;
  subscription_id?: string | null;
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

/** Result of a Pro pass grant. `granted` is false for a replayed payment. */
export interface PassGrantResult {
  userId: string;
  granted: boolean;
  /** True when the new pass extended one that was still active. */
  stacked: boolean;
}

/** What a dispatched webhook did, for callers that report it (analytics). */
export interface DispatchResult {
  provisioned?: ProvisionResult & { tier: string };
  pass?: PassGrantResult;
}

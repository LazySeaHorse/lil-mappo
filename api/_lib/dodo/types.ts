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

/**
 * TypeScript types for li'l Mappo's Supabase tables.
 * Keep in sync with supabase/migrations/001_initial_schema.sql
 */

export type SubscriptionTier = 'wanderer' | 'cartographer' | 'pioneer';
export type RenderStatus = 'queued' | 'rendering' | 'done' | 'failed';

export interface Subscription {
  user_id: string;
  tier: SubscriptionTier;
  monthly_credits: number;
  parallel_renders: number;
  renewal_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreditBalance {
  user_id: string;
  monthly_credits: number;
  purchased_credits: number;
  monthly_reset_date: string | null;
  updated_at: string;
}

export interface RenderJob {
  id: string;
  user_id: string;
  status: RenderStatus;
  resolution: string | null;
  duration_sec: number | null;
  fps: number | null;
  gpu: boolean;
  credits_cost: number;
  output_url: string | null;
  temp_project_path: string | null;
  created_at: string;
  expires_at: string | null;
  error_message: string | null;
}

export const TIER_LABELS: Record<SubscriptionTier, string> = {
  wanderer: 'Wanderer',
  cartographer: 'Cartographer',
  pioneer: 'Pioneer',
};

export const STATUS_LABELS: Record<RenderStatus, string> = {
  queued: 'Queued',
  rendering: 'Rendering',
  done: 'Done',
  failed: 'Failed',
};

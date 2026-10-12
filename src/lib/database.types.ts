/**
 * TypeScript types for li'l Mappo's Supabase tables.
 * Keep in sync with supabase/migrations/ (tables from 001, feature-vote RPCs from 022).
 * Hand-written, not generated.
 */

/**
 * Active paid tier. "nomad" | "cartographer" | "pioneer" are legacy values
 * kept for DB compatibility but are no longer issued to new users.
 * Free tier = no subscription row.
 */
export type SubscriptionTier = "wanderer" | "nomad" | "cartographer" | "pioneer";
export type RenderStatus = "queued" | "rendering" | "done" | "failed";

export interface Subscription {
  user_id: string;
  tier: SubscriptionTier;
  monthly_credits: number;
  parallel_renders: number;
  renewal_date: string | null;
  dodo_subscription_id: string | null;
  status: "active" | "cancelling" | "cancelled" | "expired" | "on_hold" | "failed";
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
  // v2 fields (migration 011)
  aspect_ratio: string | null;
  resolution_preset: string | null;
  is_vertical: boolean;
  render_config: Record<string, unknown> | null;
  project_data: Record<string, unknown> | null;
  render_secret_hash: string | null;
  monthly_credits_charged: number;
  purchased_credits_charged: number;
}

export interface CloudProject {
  id: string;
  user_id: string;
  name: string;
  data: Record<string, unknown>;
  updated_at: string;
  created_at: string;
}

/** Coarse vote tier returned by get_feature_vote_summaries (migration 022). */
export type FeatureVoteTier = "none" | "few" | "some" | "many" | "most";

/** One row of the get_feature_vote_summaries(p_feature_ids text[]) RPC. */
export interface FeatureVoteSummary {
  feature_id: string;
  tier: FeatureVoteTier;
  most_requested: boolean;
  /** Whether the calling user has voted for this feature. */
  has_voted: boolean;
}

/**
 * Signatures of the feature-vote RPCs (migration 022). Both require a signed-in
 * user. `set_feature_vote` is idempotent and resolves to the resulting vote state.
 */
export interface FeatureVoteRpcs {
  get_feature_vote_summaries: {
    Args: { p_feature_ids: string[] };
    Returns: FeatureVoteSummary[];
  };
  set_feature_vote: {
    Args: { p_feature_id: string; p_voted: boolean };
    Returns: boolean;
  };
}

export const TIER_LABELS: Record<SubscriptionTier, string> = {
  wanderer: "Wanderer",
  nomad: "Nomad",
  cartographer: "Cartographer",
  pioneer: "Pioneer",
};

export const STATUS_LABELS: Record<RenderStatus, string> = {
  queued: "Queued",
  rendering: "Rendering",
  done: "Done",
  failed: "Failed",
};

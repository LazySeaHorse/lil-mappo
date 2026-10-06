import type { FeatureVoteTier } from '@/lib/database.types';

/**
 * Features we are considering building. Each one shows up as an "I'd like this"
 * pill on the surface that is currently "Not available yet" (see FeatureVotes/).
 *
 * `id` is what gets stored in `public.feature_votes`, so it must match the SQL
 * check in migration 022 (lowercase words joined by single hyphens, max 48 chars)
 * and must never be renamed once people have voted for it.
 */
export interface UpcomingFeature {
  id: string;
  title: string;
  /** One friendly sentence shown under the title. */
  description: string;
}

export const UPCOMING_FEATURES = [
  {
    id: 'cloud-render',
    title: 'Cloud render',
    description: 'Render your video on our servers instead of in your browser.',
  },
  {
    id: 'example-projects',
    title: 'Example projects',
    description: 'A gallery of ready-made projects to open, learn from and remix.',
  },
] as const satisfies readonly UpcomingFeature[];

export type UpcomingFeatureId = (typeof UPCOMING_FEATURES)[number]['id'];

export const UPCOMING_FEATURE_IDS: readonly UpcomingFeatureId[] = UPCOMING_FEATURES.map((f) => f.id);

/** Same rule as the check constraint on public.feature_votes.feature_id. */
export const FEATURE_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const FEATURE_ID_MAX_LENGTH = 48;

export function getUpcomingFeature(id: UpcomingFeatureId): (typeof UPCOMING_FEATURES)[number] {
  return UPCOMING_FEATURES.find((f) => f.id === id)!;
}

/** Coarse labels only: the server never sends counts. */
export const TIER_COPY: Record<FeatureVoteTier, string> = {
  none: 'Be the first to ask for this',
  few: 'A few people want this',
  some: 'Some people want this',
  many: 'Lots of people want this',
  most: 'Most people want this',
};

export const MOST_REQUESTED_LABEL = 'Most requested';

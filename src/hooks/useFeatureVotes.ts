import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { FeatureVoteRpcs, FeatureVoteSummary } from '@/lib/database.types';
import { useAuthStore } from '@/store/useAuthStore';
import { UPCOMING_FEATURE_IDS } from '@/config/upcomingFeatures';

type RpcResult<T> = Promise<{ data: T | null; error: { message: string } | null }>;

/** The app's supabase client is untyped; this narrows just the two vote RPCs. */
const rpc = supabase.rpc.bind(supabase) as unknown as {
  <K extends keyof FeatureVoteRpcs>(fn: K, args: FeatureVoteRpcs[K]['Args']): RpcResult<FeatureVoteRpcs[K]['Returns']>;
};

const queryKey = (userId: string | undefined) => ['feature_votes', userId] as const;

/**
 * Vote tiers for every configured upcoming feature, fetched in one call.
 * Pass `enabled: false` until someone opens a feature preview so the app makes
 * no vote requests for people who never look.
 */
export function useFeatureVotes(enabled: boolean) {
  const user = useAuthStore((s) => s.user);

  return useQuery<FeatureVoteSummary[]>({
    queryKey: queryKey(user?.id),
    enabled: !!user && enabled,
    queryFn: async () => {
      const { data, error } = await rpc('get_feature_vote_summaries', {
        p_feature_ids: [...UPCOMING_FEATURE_IDS],
      });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

/** Votes or unvotes. The toggle flips immediately and rolls back if the call fails. */
export function useSetFeatureVote() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const key = queryKey(user?.id);

  return useMutation({
    mutationFn: async ({ featureId, voted }: { featureId: string; voted: boolean }) => {
      const { error } = await rpc('set_feature_vote', { p_feature_id: featureId, p_voted: voted });
      if (error) throw error;
    },
    onMutate: async ({ featureId, voted }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<FeatureVoteSummary[]>(key);
      queryClient.setQueryData<FeatureVoteSummary[]>(key, (rows) =>
        rows?.map((r) => (r.feature_id === featureId ? { ...r, has_voted: voted } : r)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

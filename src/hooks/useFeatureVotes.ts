import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { track } from '@/lib/analytics';
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
 * Signed-out users never trigger a request. Trigger components read it on mount
 * (via `useFeatureVoted`) so signed-in users see their own vote; every consumer
 * shares one cached query (5 minute stale time).
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

/** Whether the signed-in user has voted for a feature (false while loading or signed out). Needs a QueryClient. */
export function useFeatureVoted(featureId: string): boolean {
  const votes = useFeatureVotes(true);
  return votes.data?.find((r) => r.feature_id === featureId)?.has_voted ?? false;
}

const MUTATION_KEY = ['set_feature_vote'] as const;

/**
 * Votes or unvotes. The toggle flips immediately; if the call fails only that
 * feature's row is put back (and only if nothing newer changed it), so a
 * failure never clobbers other optimistic state. The analytics event fires on
 * success only, so failed votes are not counted.
 */
export function useSetFeatureVote() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const key = queryKey(user?.id);

  return useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: async ({ featureId, voted }: { featureId: string; voted: boolean }) => {
      const { error } = await rpc('set_feature_vote', { p_feature_id: featureId, p_voted: voted });
      if (error) throw error;
    },
    onMutate: async ({ featureId, voted }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<FeatureVoteSummary[]>(key)?.find((r) => r.feature_id === featureId);
      queryClient.setQueryData<FeatureVoteSummary[]>(key, (rows) =>
        rows?.map((r) => (r.feature_id === featureId ? { ...r, has_voted: voted } : r)),
      );
      return { previousHasVoted: before?.has_voted };
    },
    onSuccess: (_data, { featureId, voted }) => {
      track(voted ? 'feature_voted' : 'feature_unvoted', { feature_id: featureId });
    },
    onError: (_err, { featureId, voted }, context) => {
      if (context?.previousHasVoted !== undefined) {
        queryClient.setQueryData<FeatureVoteSummary[]>(key, (rows) =>
          rows?.map((r) =>
            // Only undo our own optimistic flip, never a newer state.
            r.feature_id === featureId && r.has_voted === voted ? { ...r, has_voted: context.previousHasVoted! } : r,
          ),
        );
      }
      toast.error("Couldn't save your vote. Please try again.");
    },
    onSettled: () => {
      // Refetch once the last in-flight vote lands, so a refetch never overwrites a pending optimistic flip.
      if (queryClient.isMutating({ mutationKey: MUTATION_KEY }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

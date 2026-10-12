import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { RenderJob } from '@/lib/database.types';
import { useAuthStore } from '@/store/useAuthStore';

/**
 * The columns the renders list shows. Not `*`: the list polls every 5s while
 * a job runs, and `project_data` / `render_config` hold the whole project.
 */
export const RENDER_JOB_LIST_COLUMNS = [
  'id',
  'status',
  'resolution',
  'resolution_preset',
  'aspect_ratio',
  'is_vertical',
  'fps',
  'duration_sec',
  'credits_cost',
  'output_url',
  'error_message',
  'created_at',
  'expires_at',
] as const satisfies readonly (keyof RenderJob)[];

export type RenderJobListItem = Pick<RenderJob, (typeof RENDER_JOB_LIST_COLUMNS)[number]>;

export function useRenderJobs() {
  const user = useAuthStore((s) => s.user);

  return useQuery<RenderJobListItem[]>({
    queryKey: ['render_jobs', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('render_jobs')
        .select(RENDER_JOB_LIST_COLUMNS.join(','))
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []) as unknown as RenderJobListItem[];
    },
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
    // Poll every 5 seconds while any jobs are still in progress
    refetchInterval: (query) => {
      const jobs = query.state.data;
      const hasActiveJobs = jobs?.some(
        (j) => j.status === 'queued' || j.status === 'rendering'
      );
      return hasActiveJobs ? 5_000 : false;
    },
  });
}

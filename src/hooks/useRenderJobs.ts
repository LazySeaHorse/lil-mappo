import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { RenderJob } from '@/lib/database.types';
import { useAuthStore } from '@/store/useAuthStore';

export function useRenderJobs() {
  const user = useAuthStore((s) => s.user);

  return useQuery<RenderJob[]>({
    queryKey: ['render_jobs', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('render_jobs')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 0, // Always refetch on manual refresh
    gcTime: 60_000,
  });
}

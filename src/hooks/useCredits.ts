import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { CreditBalance } from '@/lib/database.types';
import { useAuthStore } from '@/store/useAuthStore';

export function useCredits() {
  const user = useAuthStore((s) => s.user);

  return useQuery<CreditBalance | null>({
    queryKey: ['credit_balance', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('credit_balance')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    staleTime: 30_000, // 30s — credits don't change often
  });
}

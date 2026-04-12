import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Subscription } from "@/lib/database.types";
import { useAuthStore } from "@/store/useAuthStore";

export function useSubscription() {
  const user = useAuthStore((s) => s.user);

  return useQuery<Subscription | null>({
    queryKey: ["subscription", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user!.id)
        .in("status", ["active", "cancelling"])
        .maybeSingle();

      if (error) throw error;
      return data; // null = free tier (no row)
    },
    staleTime: 60_000,
  });
}

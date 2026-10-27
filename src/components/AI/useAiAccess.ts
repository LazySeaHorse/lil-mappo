import { useAuthStore } from '@/store/useAuthStore';
import { useSubscription } from '@/hooks/useSubscription';

/** AI control is open to every signed-in account, free or paid. */
export function useAiAccess() {
  const user = useAuthStore((s) => s.user);
  const { data: subscription } = useSubscription();
  const signedIn = !!user;
  return { signedIn, allowed: signedIn, subscription };
}

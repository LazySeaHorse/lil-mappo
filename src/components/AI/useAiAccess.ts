import { useAuthStore } from '@/store/useAuthStore';
import { useSubscription } from '@/hooks/useSubscription';
import { isFreeUser } from '@/lib/cloudAccess';

/** AI control is Pro only and needs an account. */
export function useAiAccess() {
  const user = useAuthStore((s) => s.user);
  const { data: subscription } = useSubscription();
  const signedIn = !!user;
  const isPro = !isFreeUser(subscription);
  return { signedIn, isPro, allowed: signedIn && isPro, subscription };
}

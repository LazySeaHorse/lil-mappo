import type { Subscription } from '@/lib/database.types';
import { isWanderer } from '@/lib/cloudAccess';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/store/useAuthStore';

/**
 * Whether the signed-in user has Pro right now (`isWanderer`: subscription or Pro pass), for code
 * that is not a React component: AI tools and the route deep link. Components use
 * `useSubscription()` with `isWanderer`. Reads the plan `useSubscription` already fetched; no
 * request is made. A guest, or a plan that is not loaded yet, is not Pro.
 */
export function isProNow(): boolean {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return false;
  return isWanderer(queryClient.getQueryData<Subscription | null>(['subscription', userId]));
}

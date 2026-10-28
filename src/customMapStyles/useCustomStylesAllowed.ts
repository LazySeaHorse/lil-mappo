import { useSubscription } from '@/hooks/useSubscription';
import { isWanderer } from '@/lib/cloudAccess';

/** Custom map styles are for paid plans (Wanderer or a Pro pass). */
export function useCustomStylesAllowed(): boolean {
  const { data: subscription } = useSubscription();
  return isWanderer(subscription);
}

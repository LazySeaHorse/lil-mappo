import type { Subscription } from '@/lib/database.types';
import { isFreeUser } from '@/lib/cloudAccess';

export type MappoMood =
  | 'default'
  | 'sleepy'
  | 'inquisitive'
  | 'curious'
  | 'happy'
  | 'blush'
  | 'sparkle'
  | 'worried'
  | 'explorer';

interface MappoAccount {
  signedIn: boolean;
  subscription: Subscription | null | undefined;
}

/** Guests keep the plain face; signed-in free users blush; paid users wear the explorer cap. */
export function accountMood({ signedIn, subscription }: MappoAccount): MappoMood {
  if (!signedIn) return 'default';
  return isFreeUser(subscription) ? 'blush' : 'explorer';
}

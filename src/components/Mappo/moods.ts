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

export type AuthFormPhase = 'editing' | 'submitting' | 'error' | 'success' | 'confirm_email';

interface AuthMoodInput {
  isSignup: boolean;
  email: string;
  password: string;
  phase: AuthFormPhase;
}

const looksLikeEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value.trim());

/**
 * Mappo perks up as the auth form fills in: sign-in starts inquisitive and warms up through
 * email then password; sign-up starts curious and ends sparkly. Success lands on the signed-in face.
 */
export function authMood({ isSignup, email, password, phase }: AuthMoodInput): MappoMood {
  if (phase === 'success') return 'blush';
  if (phase === 'error') return 'worried';
  if (phase === 'confirm_email') return 'curious';
  if (phase === 'submitting') return 'happy';

  if (password !== '') return isSignup ? 'sparkle' : 'happy';
  if (looksLikeEmail(email)) return isSignup ? 'happy' : 'curious';
  return isSignup ? 'curious' : 'inquisitive';
}

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
  | 'explorer'
  /** Holds up a gold key, for notices about what an upgrade unlocks. Draws outside the usual frame, to the right. */
  | 'key'
  | PoseMood;

/** Moods with arms and props, each made for one moment in the app. */
export type PoseMood =
  /** Squints at a phone that's too small: the mobile warning. */
  | 'phone'
  /** Winks with a wind-up film camera: the tour invite. */
  | 'camera'
  /** Reads an open paper map: new project, planning. */
  | 'map'
  /** Waves hello. */
  | 'wave'
  /** Arms up in confetti: an export finished. */
  | 'cheer'
  /** Holds up a film reel, tongue out: an export is running. */
  | 'reel'
  /** Wound up in film with dizzy eyes: an export failed. */
  | 'tangled'
  /** Holds out a boarding pass: sign in. */
  | 'ticket'
  /** Holds a heart balloon: votes and wishes. */
  | 'balloon'
  /** Grips an edge and looks up, for peeking over a card. */
  | 'peek'
  | 'peek-worried'
  /** Leans back with a sweat drop: about to delete something. */
  | 'nervous';

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

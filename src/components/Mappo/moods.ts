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
  /** Holds up a little 3D cube: importing a 3D model. */
  | 'cube'
  /** Holds up a plug on a curly cable, tongue out: connecting the AI bridge. */
  | 'plug'
  /** Leans back with a sweat drop: about to delete something. */
  | 'nervous';

/** The usual frame around the pin, in the logo mark's coordinates. */
export const MAPPO_FRAME = '351 287 553 678';

/** Where the pin's tip sits across the logo mark. */
const TIP_X = 618;

/** Wider frames for moods whose props reach past the pin. */
const WIDE_FRAMES: Partial<Record<MappoMood, string>> = {
  key: '351 287 760 678',
  phone: '351 287 690 678',
  camera: '351 287 760 678',
  wave: '211 287 693 678',
  cheer: '271 237 713 728',
  reel: '351 287 720 678',
  ticket: '351 287 760 678',
  balloon: '231 237 673 728',
  cube: '351 287 760 678',
  plug: '351 287 760 678',
};

export function mappoViewBox(mood: MappoMood): string {
  return WIDE_FRAMES[mood] ?? MAPPO_FRAME;
}

/** Width over height of the mood's frame. */
export function mappoAspect(mood: MappoMood): number {
  const [, , width, height] = mappoViewBox(mood).split(' ').map(Number);
  return width / height;
}

/** Where the pin's tip sits across the mood's frame, from 0 at the left edge to 1 at the right. */
export function mappoTipX(mood: MappoMood): number {
  const [x, , width] = mappoViewBox(mood).split(' ').map(Number);
  return (TIP_X - x) / width;
}

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

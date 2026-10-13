import { useAuthStore } from '@/store/useAuthStore';
import { hasByok } from '@/lib/cloudAccess';

/**
 * True for a guest: signed out and without their own Mapbox key. Guests cannot
 * save to the library, import files, export project files or export video.
 */
export function useGuestLock(): boolean {
  const signedIn = useAuthStore((s) => !!s.user);
  return !signedIn && !hasByok();
}

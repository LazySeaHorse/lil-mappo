import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

const mediaQuery = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null);

function subscribe(onChange: () => void) {
  const query = mediaQuery();
  query?.addEventListener?.('change', onChange);
  return () => query?.removeEventListener?.('change', onChange);
}

/** Whether the user asks the system for less motion, read once. */
export function prefersReducedMotion(): boolean {
  return mediaQuery()?.matches ?? false;
}

/** True while the user asks the system for less motion. Looping decorations show a still frame then. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}

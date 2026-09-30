import { PANEL_MARGIN } from '@/constants/layout';

export function formatRelativeTime(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

/** Top offset of floating content that sits just below the toolbar (toolbar is 56px tall). */
export function belowToolbarTop(isMobile: boolean): string {
  return isMobile
    ? `calc(env(safe-area-inset-top, 0px) + 56px + ${PANEL_MARGIN}px)`
    : `${PANEL_MARGIN + 56 + PANEL_MARGIN}px`;
}

/** Timeline panel height is a per-user UI preference, kept out of the project file. */
export const TIMELINE_HEIGHT_STORAGE_KEY = 'lil-mappo-timeline-height';
export const DEFAULT_TIMELINE_HEIGHT = 256;

export function readTimelineHeight(): number {
  try {
    const raw = localStorage.getItem(TIMELINE_HEIGHT_STORAGE_KEY);
    if (raw === null) return DEFAULT_TIMELINE_HEIGHT;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMELINE_HEIGHT;
  } catch {
    return DEFAULT_TIMELINE_HEIGHT;
  }
}

export function writeTimelineHeight(height: number): void {
  try {
    localStorage.setItem(TIMELINE_HEIGHT_STORAGE_KEY, String(height));
  } catch {
    // Storage may be blocked; the preference just won't persist.
  }
}

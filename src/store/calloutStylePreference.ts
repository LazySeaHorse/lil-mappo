/**
 * The style new callouts start with is a per-user preference, kept out of the
 * project file. Until the user picks one, new callouts use the built-in default.
 */
export const CALLOUT_STYLE_STORAGE_KEY = 'lil-mappo-default-callout-style';

export function readDefaultCalloutStyle(): string | null {
  try {
    return localStorage.getItem(CALLOUT_STYLE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeDefaultCalloutStyle(styleId: string): void {
  try {
    localStorage.setItem(CALLOUT_STYLE_STORAGE_KEY, styleId);
  } catch {
    // Storage may be blocked; the choice just won't persist.
  }
}

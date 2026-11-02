/**
 * A window of this width for the app's media queries: `useResponsive` and the
 * driver's `isPhoneLayout` both ask `matchMedia`, so a test sets the width
 * here and the app decides its layout the way it does in a browser. Returns
 * the restore function.
 */
export function setViewportWidth(width: number): () => void {
  const original = window.matchMedia;
  const matches = (query: string) => {
    const bounds = Array.from(query.matchAll(/\((min|max)-width:\s*(\d+)px\)/g));
    return bounds.length > 0 && bounds.every(([, kind, px]) => (kind === 'min' ? width >= Number(px) : width <= Number(px)));
  };
  window.matchMedia = ((query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

/** The width of the phone frame's iframe (see the shell's PHONE screen). */
export const PHONE_WIDTH = 402;

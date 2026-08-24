/**
 * Global click / pointer origin tracker for spatial dialog animations.
 * Captures pointer coordinates when interacting with UI triggers.
 */

let lastPointerPosition: { x: number; y: number; time: number } | null = null;

if (typeof window !== 'undefined') {
  const recordPoint = (e: MouseEvent | PointerEvent) => {
    // Only record valid non-zero client coordinates (avoid synthetic 0,0 clicks)
    if (typeof e.clientX === 'number' && typeof e.clientY === 'number' && (e.clientX !== 0 || e.clientY !== 0)) {
      lastPointerPosition = {
        x: e.clientX,
        y: e.clientY,
        time: Date.now(),
      };
    }
  };

  window.addEventListener('pointerdown', recordPoint, { capture: true, passive: true });
  window.addEventListener('click', recordPoint, { capture: true, passive: true });
}

/**
 * Returns the most recent click/tap origin if it occurred within maxAgeMs (default 2s).
 */
export function getRecentClickOrigin(maxAgeMs = 2000): { x: number; y: number } | null {
  if (!lastPointerPosition) return null;
  if (Date.now() - lastPointerPosition.time > maxAgeMs) {
    return null;
  }
  return { x: lastPointerPosition.x, y: lastPointerPosition.y };
}

/**
 * Computes standard CSS transform-origin percentage for an element
 * relative to the clicked coordinates on the screen.
 */
export function computeOriginTransform(
  element: HTMLElement | null,
  clickOrigin: { x: number; y: number } | null = getRecentClickOrigin()
): string {
  if (!element || !clickOrigin) return 'center';

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return 'center';

  // Calculate percentage relative to the element's actual layout bounds
  const originX = ((clickOrigin.x - rect.left) / rect.width) * 100;
  const originY = ((clickOrigin.y - rect.top) / rect.height) * 100;

  return `${Math.round(originX)}% ${Math.round(originY)}%`;
}

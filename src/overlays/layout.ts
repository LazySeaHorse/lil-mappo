/**
 * Overlay geometry shared by every backend, in CSS px at scale 1. Multiply by
 * `overlayScale(width, height)` for the output size.
 */
export const OVERLAY_LAYOUT = {
  margin: 12,
  /** Same size as Mapbox's own `.mapboxgl-ctrl-logo`. */
  mapboxLogo: { width: 88, height: 23 },
  /** The li'l Mappo mark's viewBox is 553x678. */
  brand: { markHeight: 28, markAspect: 553 / 678, gap: 8, fontSize: 20, fontWeight: 600, fontFamily: 'Outfit' },
  attribution: { fontSize: 12 },
  shadow: { color: 'rgba(0, 0, 0, 0.35)', blur: 6, offsetY: 1 },
} as const;

/** Grows overlays with the output so they don't shrink to nothing at 4K; never below 1. */
export function overlayScale(width: number, height: number): number {
  return Math.max(1, Math.min(width, height) / 1080);
}

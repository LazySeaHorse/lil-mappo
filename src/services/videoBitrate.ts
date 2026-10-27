// Kept apart from videoExport.ts so the capability probe can share it without pulling in mediabunny.

/**
 * Bits per pixel per frame. Map footage (pans over imagery, fine labels, route
 * lines) changes nearly every pixel each frame, so it needs well above the
 * ~0.07 that suits ordinary video.
 */
const BITS_PER_PIXEL = 0.15;
const MIN_BITRATE = 2_000_000;
const MAX_BITRATE = 80_000_000;

/** H.264 target bitrate for an export: scales with pixel throughput so 4K and 60fps are not starved. */
export function exportBitrate(width: number, height: number, fps: number): number {
  const target = Math.round(width * height * fps * BITS_PER_PIXEL);
  return Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, target));
}

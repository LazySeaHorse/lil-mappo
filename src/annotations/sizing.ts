/**
 * How big a callout is drawn for the zoom it is viewed at.
 *
 * In 'screen' mode a callout keeps its size in pixels, whatever the zoom. In
 * 'map' mode it behaves as if printed on the map: it grows and shrinks with the
 * zoom relative to the zoom it was authored at, and its offset and altitude move
 * with it so it stays over the same geographic spot.
 */

import type { CalloutItem } from '@/store/types';

/** Largest scale a map-sized callout is drawn at, which also bounds its canvas. */
export const MAX_MAP_SCALE = 8;
/** Below this map-sized scale a callout fades out. */
export const MAP_SCALE_FADE_START = 0.2;
/** At or below this map-sized scale a callout is fully faded out and not drawn. */
export const MAP_SCALE_HIDDEN = 0.1;

export interface CalloutSizing {
  /** Scale of the callout's artwork, in editor pixels per style unit. */
  scale: number;
  /** Factor for the callout's offset and altitude, which follow the map zoom. */
  placement: number;
  /** Opacity factor, below 1 while a map-sized callout fades out. */
  fade: number;
}

/**
 * Sizing of a callout at a view zoom, or null when it is too small to draw.
 * `viewZoom` is the zoom the editor shows: an export subtracts its zoom offset
 * first. Omitted, the callout is viewed at its own reference zoom.
 */
export function resolveCalloutSizing(
  callout: Pick<CalloutItem, 'scale' | 'sizeMode' | 'referenceZoom'>,
  viewZoom: number = callout.referenceZoom,
): CalloutSizing | null {
  if (callout.sizeMode !== 'map') return { scale: callout.scale, placement: 1, fade: 1 };

  const scale = Math.min(callout.scale * 2 ** (viewZoom - callout.referenceZoom), MAX_MAP_SCALE);
  if (!(scale > MAP_SCALE_HIDDEN)) return null;

  const fade = Math.min((scale - MAP_SCALE_HIDDEN) / (MAP_SCALE_FADE_START - MAP_SCALE_HIDDEN), 1);
  return { scale, placement: scale / callout.scale, fade };
}

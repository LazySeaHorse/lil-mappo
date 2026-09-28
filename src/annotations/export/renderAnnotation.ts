/**
 * Export renderer for annotations.
 *
 * Draws through the same frame pipeline as the live preview (see ../draw),
 * so exported frames match what the editor shows.
 */

import type { Map as MapboxMap } from 'mapbox-gl';
import type { CalloutItem, TimelineItem } from '@/store/types';
import { drawAnnotationFrame, prepareAnnotationFrame } from '@/annotations/draw';

/** Render all annotations for a frame onto the compositing canvas. */
export function compositeAnnotations(
  map: MapboxMap,
  ctx: CanvasRenderingContext2D,
  items: Record<string, TimelineItem>,
  itemOrder: string[],
  playheadTime: number,
): void {
  for (const id of itemOrder) {
    const item = items[id];
    if (item?.kind !== 'callout') continue;
    const callout = item as CalloutItem;

    const frame = prepareAnnotationFrame(callout, playheadTime);
    if (!frame || frame.opacity <= 0 || callout.binding.kind !== 'geographic') continue;

    const projected = map.project(callout.binding.lngLat);
    drawAnnotationFrame(ctx, frame, projected.x, projected.y);
  }
}

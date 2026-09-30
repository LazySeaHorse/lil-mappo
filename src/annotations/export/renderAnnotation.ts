/**
 * Compositor for annotations.
 *
 * Draws through the same frame pipeline for the live editor overlay and for
 * exports (see ../draw), so exported frames match what the editor shows.
 */

import type { Map as MapboxMap } from 'mapbox-gl';
import type { CalloutItem, TimelineItem } from '@/store/types';
import { drawAnnotationFrame, prepareAnnotationFrame } from '@/annotations/draw';
import { isSelectionPreview } from '@/engine/selectionPreview';

export interface CompositeView {
  /**
   * log2(output width / editor width): how far the map was zoomed in to render
   * larger than the editor. Callouts are drawn 2^zoomOffset times larger so they
   * keep their size relative to the frame. Default 0, the editor itself.
   */
  zoomOffset?: number;
  /**
   * The selected callout. When it is off the playhead it is drawn settled so it
   * can be edited. Exports leave this unset, so they match the timeline.
   */
  selectedId?: string | null;
}

/** Render all annotations for a frame onto the compositing canvas. */
export function compositeAnnotations(
  map: MapboxMap,
  ctx: CanvasRenderingContext2D,
  items: Record<string, TimelineItem>,
  itemOrder: string[],
  playheadTime: number,
  { zoomOffset = 0, selectedId = null }: CompositeView = {},
): void {
  // The zoom the editor shows, whatever size the map was rendered at.
  const viewZoom = map.getZoom() - zoomOffset;
  const pixelScale = 2 ** zoomOffset;

  for (const id of itemOrder) {
    const item = items[id];
    if (item?.kind !== 'callout') continue;
    const callout = item as CalloutItem;

    const settled = isSelectionPreview(callout, playheadTime, callout.id === selectedId);
    const frame = prepareAnnotationFrame(callout, playheadTime, { viewZoom, pixelScale, settled });
    if (!frame || frame.opacity <= 0 || callout.binding.kind !== 'geographic') continue;

    const projected = map.project(callout.binding.lngLat);
    drawAnnotationFrame(ctx, frame, projected.x, projected.y);
  }
}

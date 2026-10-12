import type { Map as MapboxMap } from 'mapbox-gl';
import type { TimelineItem } from '@/store/types';
import { compositeAnnotations } from '@/annotations/export/renderAnnotation';
import { drawOverlays, type OverlayLayer } from '@/overlays';
import { useProjectStore } from '@/store/useProjectStore';

/**
 * Draws the current map frame (map canvas + callouts + overlays) onto compCtx.
 * Shared by the video export pipeline and the snapshot tool. `zoomOffset` is how far the
 * map was zoomed in to render at this size (see FrameCapturer.zoomOffset).
 */
export function compositeFrame(
  map: MapboxMap,
  compCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  items: Record<string, TimelineItem>,
  itemOrder: string[],
  playheadTime: number,
  overlays: OverlayLayer[],
  zoomOffset: number,
): void {
  const mapCanvas = map.getCanvas() as HTMLCanvasElement;
  compCtx.clearRect(0, 0, width, height);
  compCtx.drawImage(mapCanvas, 0, 0, width, height);

  // Render all annotations using the unified style registry and scene renderer
  compositeAnnotations(map, compCtx, items, itemOrder, playheadTime, { zoomOffset });

  drawOverlays(compCtx, overlays, width, height);
}

/**
 * Temporarily lends the map viewport to a capture operation. Container styles
 * and the exact free-camera state are restored after the operation, including
 * when capture fails or is cancelled. Marks the store meanwhile, so the editor's
 * own overlays stay out of the way of the resized map.
 */
export async function withTemporaryMapViewport<T>(
  map: MapboxMap,
  width: number,
  height: number,
  fn: () => Promise<T>,
): Promise<T> {
  const mapContainer = map.getContainer() as HTMLElement;
  const originalInlineStyles = mapContainer.style.cssText;
  const originalCamera = map.getFreeCameraOptions();

  useProjectStore.setState({ isCapturingViewport: true });
  mapContainer.style.position = 'fixed';
  mapContainer.style.width = `${width}px`;
  mapContainer.style.height = `${height}px`;
  mapContainer.style.left = '0';
  mapContainer.style.top = '0';
  mapContainer.style.zIndex = '-100';
  map.resize();

  try {
    return await fn();
  } finally {
    mapContainer.style.cssText = originalInlineStyles;
    map.resize();
    map.setFreeCameraOptions(originalCamera);
    useProjectStore.setState({ isCapturingViewport: false });
  }
}

import type { CalloutItem, Item } from '@/store/types';
import { computeCalloutAnimation, renderCalloutToCanvas } from './renderCallout';

/**
 * Draws the current map frame (map canvas + callouts) onto compCtx.
 * Shared by the video export pipeline and the snapshot tool.
 */
export function compositeFrame(
  map: any,
  compCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  items: Record<string, Item>,
  itemOrder: string[],
  playheadTime: number,
): void {
  const mapCanvas = map.getCanvas() as HTMLCanvasElement;
  compCtx.clearRect(0, 0, width, height);
  compCtx.drawImage(mapCanvas, 0, 0, width, height);

  const zoom = map.getZoom();
  for (const id of itemOrder) {
    const item = items[id];
    if (item?.kind !== 'callout') continue;
    const callout = item as CalloutItem;
    if (callout.lngLat[0] === 0 && callout.lngLat[1] === 0) continue;

    const anim = computeCalloutAnimation(callout, playheadTime);
    if (!anim || anim.opacity <= 0) continue;

    const projected = map.project(callout.lngLat);
    let altitudeOffset = 0;
    if (callout.altitude > 0) {
      const metersPerPixel =
        (156543.03392 * Math.cos((callout.lngLat[1] * Math.PI) / 180)) /
        Math.pow(2, zoom);
      altitudeOffset = Math.min(callout.altitude / metersPerPixel, 300);
    }

    renderCalloutToCanvas(compCtx, callout, anim, { x: projected.x, y: projected.y }, altitudeOffset);
  }

  // Draw Mapbox attribution (required for legal compliance on exported assets)
  // Since attribution is a DOM overlay, it doesn't exist on the map canvas itself.
  const attribText = '© Mapbox © OpenStreetMap';
  compCtx.save();
  compCtx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  compCtx.textAlign = 'right';
  compCtx.textBaseline = 'bottom';
  // Subtle white glow/shadow for readability on dark map areas
  compCtx.shadowColor = 'white';
  compCtx.shadowBlur = 4;
  compCtx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  compCtx.fillText(attribText, width - 8, height - 8);
  compCtx.restore();
}

/**
 * Resizes the map container off-screen to the target capture dimensions,
 * runs fn(), then restores original styles — always, even on error.
 */
export async function withMapResized<T>(
  map: any,
  width: number,
  height: number,
  fn: () => Promise<T>,
): Promise<T> {
  const mapContainer = map.getContainer() as HTMLElement;
  const orig = {
    width: mapContainer.style.width,
    height: mapContainer.style.height,
    position: mapContainer.style.position,
    left: mapContainer.style.left,
    top: mapContainer.style.top,
    zIndex: mapContainer.style.zIndex,
  };

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
    mapContainer.style.width = orig.width;
    mapContainer.style.height = orig.height;
    mapContainer.style.position = orig.position;
    mapContainer.style.left = orig.left;
    mapContainer.style.top = orig.top;
    mapContainer.style.zIndex = orig.zIndex;
    map.resize();
  }
}

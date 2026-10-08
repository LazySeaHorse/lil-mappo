import { getOverlayImages, type OverlayImages } from './assets';
import { OVERLAY_LAYOUT as L, SYSTEM_FONT as FALLBACK_FONT, overlayScale } from './layout';
import type { OverlayAnchor, OverlayLayer } from './types';

/**
 * Canvas backend: draws each layer at its anchor, scaled for the output size.
 * Call after the map and annotations so overlays sit on top. Layers whose image
 * isn't loaded are skipped (await `preloadOverlayAssets` first).
 */
export function drawOverlays(
  ctx: CanvasRenderingContext2D,
  layers: OverlayLayer[],
  width: number,
  height: number,
  images: OverlayImages | null = getOverlayImages(),
): void {
  const s = overlayScale(width, height);
  const margin = L.margin * s;

  /** Top-left corner of a w*h block at the anchor. */
  const place = (anchor: OverlayAnchor, w: number, h: number): [number, number] => [
    anchor.endsWith('left') ? margin : width - margin - w,
    anchor.startsWith('top') ? margin : height - margin - h,
  ];

  for (const layer of layers) {
    ctx.save();
    ctx.shadowColor = L.shadow.color;
    ctx.shadowBlur = L.shadow.blur * s;
    ctx.shadowOffsetY = L.shadow.offsetY * s;

    switch (layer.kind) {
      case 'mapbox-logo': {
        if (!images) break;
        // Mapbox's own mark; no extra shadow, it carries its own outline.
        ctx.shadowColor = 'transparent';
        const w = L.mapboxLogo.width * s;
        const h = L.mapboxLogo.height * s;
        const [x, y] = place(layer.anchor, w, h);
        ctx.drawImage(images.mapboxLogo, x, y, w, h);
        break;
      }
      case 'attribution': {
        const size = L.attribution.fontSize * s;
        ctx.font = `${size}px ${FALLBACK_FONT}`;
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'white';
        const w = ctx.measureText(layer.text).width;
        const [x, y] = place(layer.anchor, w, size);
        ctx.fillText(layer.text, x, y + size);
        break;
      }
      case 'brand': {
        if (!images) break;
        const markH = L.brand.markHeight * s;
        const markW = markH * L.brand.markAspect;
        const gap = L.brand.gap * s;
        ctx.font = `${L.brand.fontWeight} ${L.brand.fontSize * s}px ${L.brand.fontFamily}, ${FALLBACK_FONT}`;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'white';
        const text = "li'l Mappo";
        const w = markW + gap + ctx.measureText(text).width;
        const [x, y] = place(layer.anchor, w, markH);
        ctx.drawImage(images.brandMark, x, y, markW, markH);
        ctx.fillText(text, x + markW + gap, y + markH / 2);
        break;
      }
    }
    ctx.restore();
  }
}

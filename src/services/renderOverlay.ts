/**
 * Canvas 2D rendering for VideoOverlay items.
 *
 * Watermark is pre-baked to an offscreen canvas once in initEncoder() via
 * bakeWatermark() and then blitted per-frame via drawImage — no per-frame
 * text measuring or image loading.
 */

import type { VideoOverlay } from '@/store/types';
import { hexWithAlpha, roundRect } from './canvasHelpers';

// ─── Watermark pre-baking ─────────────────────────────────────────────────────

/** Async image loader helper. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export interface BakedWatermark {
  canvas: HTMLCanvasElement;
  /** Natural width/height of the baked canvas — used for aspect-ratio-correct blitting. */
  width: number;
  height: number;
}

/**
 * Bake the watermark (logo + wordmark) into an offscreen canvas once.
 * Called from initEncoder(). Result is stored in EncoderState and blitted
 * each frame with a single drawImage call.
 */
export async function bakeWatermark(
  logoUrl: string,
  text: string,
  fontFamily: string,
  fontSize: number,
  color: string,
  fontWeight: 'normal' | 'bold',
): Promise<BakedWatermark> {
  const SCALE = 2; // HiDPI bake
  const PAD = 6 * SCALE;
  const GAP = 6 * SCALE;
  const scaledFontSize = fontSize * SCALE;
  const logoSize = scaledFontSize * 1.4;

  // Measure text on a temp canvas
  const tmp = document.createElement('canvas');
  const tmpCtx = tmp.getContext('2d')!;
  tmpCtx.font = `${fontWeight} ${scaledFontSize}px '${fontFamily}', sans-serif`;
  const textWidth = tmpCtx.measureText(text).width;

  const totalWidth = PAD + logoSize + GAP + textWidth + PAD;
  const totalHeight = Math.max(logoSize, scaledFontSize * 1.3) + PAD * 2;

  const offscreen = document.createElement('canvas');
  offscreen.width = Math.ceil(totalWidth);
  offscreen.height = Math.ceil(totalHeight);
  const ctx = offscreen.getContext('2d')!;

  // Semi-transparent pill background
  const bgAlpha = 0.35;
  ctx.fillStyle = `rgba(0, 0, 0, ${bgAlpha})`;
  roundRect(ctx, 0, 0, offscreen.width, offscreen.height, offscreen.height / 2);
  ctx.fill();

  let logoLoaded = false;
  try {
    const logoImg = await loadImage(logoUrl);
    const logoY = (offscreen.height - logoSize) / 2;
    ctx.drawImage(logoImg, PAD, logoY, logoSize, logoSize);
    logoLoaded = true;
  } catch {
    // Logo load failed — render without it
  }

  const textX = logoLoaded ? PAD + logoSize + GAP : PAD;
  const textY = offscreen.height / 2;
  ctx.font = `${fontWeight} ${scaledFontSize}px '${fontFamily}', sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // Subtle shadow for legibility over bright maps
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 4 * SCALE;
  ctx.fillText(text, textX, textY);
  ctx.shadowBlur = 0;

  return { canvas: offscreen, width: offscreen.width, height: offscreen.height };
}

// ─── Per-frame overlay renderer ───────────────────────────────────────────────

/**
 * Draw all enabled overlays onto the compositing canvas.
 * Call after callouts in captureFrame(). Overlays are rendered in array order
 * (index 0 = rendered last = topmost z).
 */
export function renderOverlaysToCanvas(
  ctx: CanvasRenderingContext2D,
  overlays: VideoOverlay[],
  canvasWidth: number,
  canvasHeight: number,
  bakedWatermark: BakedWatermark | null,
  preloadedImages: Map<string, HTMLImageElement>,
) {
  // Render in reverse so index 0 ends up on top
  for (let i = overlays.length - 1; i >= 0; i--) {
    const overlay = overlays[i];
    if (!overlay.enabled) continue;

    const px = overlay.x * canvasWidth;
    const py = overlay.y * canvasHeight;
    const pw = overlay.width * canvasWidth;
    const ph = overlay.height * canvasHeight;

    ctx.save();
    ctx.globalAlpha = overlay.opacity;

    switch (overlay.kind) {
      case 'watermark':
        if (bakedWatermark) {
          // Scale baked canvas to fit the overlay bounds, preserving aspect ratio
          const aspect = bakedWatermark.width / bakedWatermark.height;
          const drawH = ph;
          const drawW = drawH * aspect;
          // Right-align within the overlay bounds
          ctx.drawImage(bakedWatermark.canvas, px + pw - drawW, py, drawW, drawH);
        }
        break;

      case 'text':
        renderTextOverlay(ctx, overlay, px, py, pw, ph, canvasHeight);
        break;

      case 'image': {
        const img = preloadedImages.get(overlay.id);
        if (img) {
          ctx.drawImage(img, px, py, pw, ph);
        }
        break;
      }
    }

    ctx.restore();
  }
}

function renderTextOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: VideoOverlay,
  px: number,
  py: number,
  pw: number,
  ph: number,
  canvasHeight: number,
) {
  const text = overlay.text ?? '';
  if (!text) return;

  const fontFamily = overlay.fontFamily ?? 'Outfit';
  const fontWeight = overlay.fontWeight ?? 'bold';
  // Scale font size proportionally to actual canvas height vs logical 1080p
  const scaledFontSize = ((overlay.fontSize ?? 32) / 1080) * canvasHeight;

  ctx.font = `${fontWeight} ${scaledFontSize}px '${fontFamily}', sans-serif`;
  ctx.fillStyle = overlay.color ?? '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  ctx.fillText(text, px, py + ph / 2, pw);
  ctx.shadowBlur = 0;
}

// ─── Image preloading ─────────────────────────────────────────────────────────

/**
 * Preload all image overlays (base64 data URLs) into HTMLImageElements.
 * Called once in initEncoder() alongside bakeWatermark(). Returns a Map
 * keyed by overlay ID for O(1) lookup in captureFrame().
 */
export async function preloadOverlayImages(
  overlays: VideoOverlay[],
): Promise<Map<string, HTMLImageElement>> {
  const map = new Map<string, HTMLImageElement>();
  const imageOverlays = overlays.filter((o) => o.kind === 'image' && o.imageDataUrl);
  await Promise.all(
    imageOverlays.map(async (o) => {
      try {
        const img = await loadImage(o.imageDataUrl!);
        map.set(o.id, img);
      } catch {
        // Skip failed images silently
      }
    }),
  );
  return map;
}

// ─── Utility: hex with alpha (re-exported for convenience) ───────────────────
export { hexWithAlpha };

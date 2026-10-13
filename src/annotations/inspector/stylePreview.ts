/**
 * Small pictures of callout styles for the style picker.
 *
 * A preview goes through the real pipeline: a sample callout, the same frame
 * preparation the map uses (settled, fully entered) and `renderScene` on an
 * offscreen canvas. It is drawn once per style, theme and sample text and then
 * kept as a data URL, so opening the picker again costs nothing.
 */

import { createCalloutItem } from '@/store/itemFactories';
import { collectSceneAssets, drawAnnotationFrame, getFrameBounds, loadSceneAssets, prepareAnnotationFrame } from '../draw';

export type PreviewTheme = 'light' | 'dark';

/** Size of a preview in CSS pixels. */
export const PREVIEW_WIDTH = 96;
export const PREVIEW_HEIGHT = 56;
/** Canvas pixels per CSS pixel, so the picture stays sharp on dense screens. */
const PREVIEW_PIXEL_RATIO = 2;
/** Room left round the artwork, in CSS pixels. */
const PREVIEW_MARGIN = 4;
/** Seconds into the callout's life that the preview shows: after the entrance. */
const SETTLED_TIME = 2;
/** Where the sample callout sits. Only its place on the canvas matters. */
const SAMPLE_POINT: [number, number] = [2.3522, 48.8566];

/** Flat colour behind the artwork: styles are drawn for a map, so the tile gets a light or dark map tone. */
const BACKDROPS: Record<PreviewTheme, string> = { light: '#b9c3cd', dark: '#1b2230' };

/** Most previews kept. Sample text comes from titles, so the key space is open. */
const CACHE_LIMIT = 150;
const cache = new Map<string, Promise<string | null>>();

/** Forgets every preview (tests). */
export function clearStylePreviewCache(): void {
  cache.clear();
}

async function drawPreview(styleId: string, theme: PreviewTheme, text: string): Promise<string | null> {
  const item = createCalloutItem({ styleId, content: { title: text }, lngLat: SAMPLE_POINT, startTime: 0 });
  if (!item) return null;

  const canvas = document.createElement('canvas');
  canvas.width = PREVIEW_WIDTH * PREVIEW_PIXEL_RATIO;
  canvas.height = PREVIEW_HEIGHT * PREVIEW_PIXEL_RATIO;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Fonts and images first, so the frame is measured and drawn with the final ones.
  const first = prepareAnnotationFrame(item, SETTLED_TIME, { settled: true });
  if (!first) return null;
  await loadSceneAssets(collectSceneAssets(first.scene));
  const frame = prepareAnnotationFrame(item, SETTLED_TIME, { settled: true });
  if (!frame) return null;

  const bounds = getFrameBounds(frame);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  // Fit the artwork into the tile; never enlarge it past real size.
  const fit = Math.min(
    1,
    (PREVIEW_WIDTH - 2 * PREVIEW_MARGIN) / width,
    (PREVIEW_HEIGHT - 2 * PREVIEW_MARGIN) / height,
  );

  ctx.fillStyle = BACKDROPS[theme];
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(PREVIEW_PIXEL_RATIO, PREVIEW_PIXEL_RATIO);
  // Centre the box on the tile; the ground point is the frame's origin.
  ctx.translate(PREVIEW_WIDTH / 2, PREVIEW_HEIGHT / 2);
  ctx.scale(fit, fit);
  ctx.translate(-(bounds.minX + bounds.maxX) / 2, -(bounds.minY + bounds.maxY) / 2);
  drawAnnotationFrame(ctx, frame, 0, 0);
  ctx.restore();
  return canvas.toDataURL('image/png');
}

/**
 * The picture of a style as a data URL, or null when it cannot be drawn (no
 * canvas, unknown style). Cached per style, theme and sample text.
 */
export function getStylePreview(styleId: string, theme: PreviewTheme, text: string): Promise<string | null> {
  const key = `${styleId}|${theme}|${text}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const pending = drawPreview(styleId, theme, text).catch(() => null);
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, pending);
  return pending;
}

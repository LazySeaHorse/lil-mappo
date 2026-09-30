/**
 * Shared text measurement for annotation styles.
 *
 * Styles size their cards from measured text, so measurement must match what
 * the canvas renderer will actually draw. Uses a cached 2D context; falls back
 * to a character-count estimate only where no canvas is available (e.g. jsdom).
 * Measured widths are cached, and dropped when web fonts finish loading, since
 * widths measured with a fallback font are wrong.
 */

type MeasureContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

let measureCtx: MeasureContext | null = null;
let measureCtxUnavailable = false;

/** Most widths kept. Text is measured every frame, but from a small working set. */
export const TEXT_WIDTH_CACHE_SIZE = 500;

/** Insertion order is recency order: a hit moves its entry to the end, the oldest is evicted first. */
const widthCache = new Map<string, number>();
let cacheEpoch = 0;
let watchingFonts = false;

/**
 * Changes whenever cached widths are dropped. Anything derived from measured
 * text can hold on to it and know when it went stale.
 */
export function getTextMetricsEpoch(): number {
  return cacheEpoch;
}

/** Drops every cached width, e.g. because fonts changed what text measures. */
export function clearTextWidthCache(): void {
  widthCache.clear();
  cacheEpoch += 1;
}

function watchFontLoading(): void {
  if (watchingFonts) return;
  watchingFonts = true;
  if (typeof document !== 'undefined') {
    document.fonts?.addEventListener?.('loadingdone', clearTextWidthCache);
  }
}

function getMeasureContext(): MeasureContext | null {
  if (measureCtx || measureCtxUnavailable) return measureCtx;
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      measureCtx = new OffscreenCanvas(1, 1).getContext('2d');
    } else if (typeof document !== 'undefined') {
      measureCtx = document.createElement('canvas').getContext('2d');
    }
  } catch {
    measureCtx = null;
  }
  if (!measureCtx) measureCtxUnavailable = true;
  return measureCtx;
}

/** Converts a CSS letter-spacing value ('0.05em' or '1px') to pixels. */
function letterSpacingToPx(letterSpacing: string | undefined, fontSize: number): number {
  if (!letterSpacing) return 0;
  const value = parseFloat(letterSpacing) || 0;
  if (letterSpacing.endsWith('em')) return value * fontSize;
  if (letterSpacing.endsWith('px')) return value;
  return 0;
}

export function buildFont(
  fontSize: number,
  fontFamily: string,
  fontWeight = 400,
  fontStyle: 'normal' | 'italic' = 'normal',
): string {
  const style = fontStyle === 'italic' ? 'italic ' : '';
  return `${style}${fontWeight} ${fontSize}px '${fontFamily}', sans-serif`;
}

/**
 * Measures the rendered width of a single line of text in CSS pixels.
 * Letter spacing is added per character, matching how the renderer applies it.
 */
export function measureTextWidth(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontWeight = 400,
  letterSpacing?: string,
  fontStyle: 'normal' | 'italic' = 'normal',
): number {
  if (!text) return 0;
  const spacing = letterSpacingToPx(letterSpacing, fontSize) * text.length;

  const font = buildFont(fontSize, fontFamily, fontWeight, fontStyle);
  const key = `${font}|${letterSpacing ?? ''}|${text}`;
  const cached = widthCache.get(key);
  if (cached !== undefined) {
    widthCache.delete(key);
    widthCache.set(key, cached);
    return cached;
  }

  const ctx = getMeasureContext();
  if (ctx) {
    ctx.font = font;
    const width = ctx.measureText(text).width;
    if (width > 0) {
      watchFontLoading();
      widthCache.set(key, width + spacing);
      if (widthCache.size > TEXT_WIDTH_CACHE_SIZE) widthCache.delete(widthCache.keys().next().value!);
      return width + spacing;
    }
  }

  const charRatio = fontWeight >= 700 ? 0.6 : 0.55;
  return text.length * fontSize * charRatio + spacing;
}

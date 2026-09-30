/**
 * Shared text measurement for annotation styles.
 *
 * Styles size their cards from measured text, so measurement must match what
 * the canvas renderer will actually draw. Uses a cached 2D context; falls back
 * to a character-count estimate only where no canvas is available (e.g. jsdom).
 */

type MeasureContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

let measureCtx: MeasureContext | null = null;
let measureCtxUnavailable = false;

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

  const ctx = getMeasureContext();
  if (ctx) {
    ctx.font = buildFont(fontSize, fontFamily, fontWeight, fontStyle);
    const width = ctx.measureText(text).width;
    if (width > 0) return width + spacing;
  }

  const charRatio = fontWeight >= 700 ? 0.6 : 0.55;
  return text.length * fontSize * charRatio + spacing;
}

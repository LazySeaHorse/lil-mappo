/**
 * Topographic annotation style.
 *
 * Backward-compatible replacement for the legacy 'topo' callout variant.
 * Visual: A topographic/military-style label with a thin left vertical border,
 * coordinates line (small, accent colored), uppercase title, and elevation line
 * below a thin separator. Has a small accent square marker at the bottom-left corner.
 */

import { z } from 'zod';
import type { AnnotationStyleDefinition, StyleRenderInput, SceneNode } from '../types';
import { group, rect, pill, circle, text, line, shadows } from '../scene/primitives';

// ─── Settings Schema ──────────────────────────────────────────────────────────

export const topoLabelSettingsSchema = z.object({
  textColor: z.string().default('#f8fafc'),
  accentColor: z.string().default('#3b82f6'),
  fontFamily: z.string().default('Outfit'),
  showMetadata: z.boolean().default(true),
});

export type TopoLabelSettings = z.infer<typeof topoLabelSettingsSchema>;

export const defaultTopoLabelSettings: TopoLabelSettings = {
  textColor: '#f8fafc',
  accentColor: '#3b82f6',
  fontFamily: 'Outfit',
  showMetadata: true,
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PAD_LEFT = 12;
const PAD_RIGHT = 8;
const PAD_V = 4;
const BORDER_WIDTH = 1;

const COORD_FONT_SIZE = 9;
const COORD_FONT_WEIGHT = 700;
const COORD_LETTER_SPACING = '0.05em';
const COORD_GAP = 4;

const TITLE_FONT_SIZE = 14;
const TITLE_FONT_WEIGHT = 700;
const TITLE_LINE_HEIGHT_MULT = 1.3;

const SEPARATOR_GAP = 4;
const SEPARATOR_HEIGHT = 1;
const ELEVATION_GAP = 4;
const ELEVATION_FONT_SIZE = 10;
const ELEVATION_FONT_WEIGHT = 400;

const SQUARE_SIZE = 4;

// ─── Text Measurement ─────────────────────────────────────────────────────────

let cachedMeasureCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
let measureCtxFailed = false;

function measureTextWidth(
  rawText: string,
  fontSize: number,
  fontFamily: string,
  fontWeight = 700,
  letterSpacing?: string,
): number {
  if (!rawText) return 0;

  if (!cachedMeasureCtx && !measureCtxFailed) {
    try {
      if (typeof OffscreenCanvas !== 'undefined') {
        const canvas = new OffscreenCanvas(1, 1);
        cachedMeasureCtx = canvas.getContext('2d');
      } else if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        cachedMeasureCtx = canvas.getContext('2d');
      }
    } catch {
      measureCtxFailed = true;
    }
    if (!cachedMeasureCtx) {
      measureCtxFailed = true;
    }
  }

  let measured = 0;
  if (cachedMeasureCtx) {
    cachedMeasureCtx.font = `${fontWeight} ${fontSize}px '${fontFamily}', sans-serif`;
    if (letterSpacing && 'letterSpacing' in cachedMeasureCtx) {
      try {
        (cachedMeasureCtx as CanvasRenderingContext2D).letterSpacing = letterSpacing;
      } catch {
        // letterSpacing might not be supported in some environments
      }
    }
    measured = cachedMeasureCtx.measureText(rawText).width;
    if (letterSpacing && 'letterSpacing' in cachedMeasureCtx) {
      try {
        (cachedMeasureCtx as CanvasRenderingContext2D).letterSpacing = '0px';
      } catch {
        // ignore
      }
    }
  }

  // Fallback approximation for headless or non-canvas test environments
  if (measured <= 0 && rawText.length > 0) {
    const charRatio = fontWeight >= 700 ? 0.6 : 0.55;
    measured = rawText.length * fontSize * charRatio;
    if (letterSpacing) {
      if (letterSpacing.endsWith('em')) {
        const em = parseFloat(letterSpacing) || 0;
        measured += rawText.length * em * fontSize;
      } else if (letterSpacing.endsWith('px')) {
        const px = parseFloat(letterSpacing) || 0;
        measured += rawText.length * px;
      }
    }
  }

  return measured;
}

// ─── Measurement & Render ─────────────────────────────────────────────────────

function measureTopoLabel(
  input: StyleRenderInput<TopoLabelSettings>,
): { width: number; height: number } {
  const { content, settings } = input;
  const showMeta = Boolean(settings?.showMetadata ?? defaultTopoLabelSettings.showMetadata);
  const fontFamily = settings?.fontFamily || defaultTopoLabelSettings.fontFamily;

  const rawTitle = content?.title ?? '';
  const titleText = rawTitle.toUpperCase();
  const titleW = measureTextWidth(titleText, TITLE_FONT_SIZE, fontFamily, TITLE_FONT_WEIGHT);

  let metaTopW = 0;
  let metaBottomW = 0;

  if (showMeta) {
    if (content?.eyebrow) {
      metaTopW = measureTextWidth(
        content.eyebrow,
        COORD_FONT_SIZE,
        fontFamily,
        COORD_FONT_WEIGHT,
        COORD_LETTER_SPACING,
      );
    }
    if (content?.body) {
      metaBottomW = measureTextWidth(
        content.body,
        ELEVATION_FONT_SIZE,
        fontFamily,
        ELEVATION_FONT_WEIGHT,
      );
    }
  }

  const contentW = Math.max(titleW, metaTopW, metaBottomW);
  const width = BORDER_WIDTH + PAD_LEFT + contentW + PAD_RIGHT;

  let height = PAD_V;
  if (showMeta) {
    height += COORD_FONT_SIZE + COORD_GAP;
  }
  height += TITLE_FONT_SIZE * TITLE_LINE_HEIGHT_MULT;
  if (showMeta) {
    height += SEPARATOR_GAP + SEPARATOR_HEIGHT + ELEVATION_GAP + ELEVATION_FONT_SIZE;
  }
  height += PAD_V;

  return { width, height };
}

function renderTopoLabel(input: StyleRenderInput<TopoLabelSettings>): SceneNode {
  const { content, settings } = input;
  const showMeta = Boolean(settings?.showMetadata ?? defaultTopoLabelSettings.showMetadata);
  const fontFamily = settings?.fontFamily || defaultTopoLabelSettings.fontFamily;
  const textColor = settings?.textColor ?? defaultTopoLabelSettings.textColor;
  const accentColor = settings?.accentColor ?? defaultTopoLabelSettings.accentColor;

  const rawTitle = content?.title ?? '';
  const titleText = rawTitle.toUpperCase();

  const { width: cardW, height: cardH } = measureTopoLabel(input);
  const cardX = -cardW / 2;
  const cardY = -cardH;

  const textX = cardX + BORDER_WIDTH + PAD_LEFT;
  let currentY = cardY + PAD_V;

  const children: SceneNode[] = [];

  // 1. Draw a 1px left vertical border line (white 30% opacity)
  children.push(
    line({
      x1: cardX,
      y1: cardY,
      x2: cardX,
      y2: cardY + cardH,
      stroke: 'rgba(255, 255, 255, 0.3)',
      strokeWidth: BORDER_WIDTH,
    }),
  );

  if (showMeta) {
    // 2. Draw coordinates (content.eyebrow) in accent color, font weight 700, size 9px, letter spacing '0.05em'
    children.push(
      text({
        x: textX,
        y: currentY,
        text: content?.eyebrow ?? '',
        fontSize: COORD_FONT_SIZE,
        fontFamily,
        fontWeight: COORD_FONT_WEIGHT,
        letterSpacing: COORD_LETTER_SPACING,
        fill: accentColor,
        align: 'left',
        baseline: 'top',
      }),
    );
    currentY += COORD_FONT_SIZE + COORD_GAP;

    // 3. Draw title in uppercase, weight 700, size 14px
    children.push(
      text({
        x: textX,
        y: currentY,
        text: titleText,
        fontSize: TITLE_FONT_SIZE,
        fontFamily,
        fontWeight: TITLE_FONT_WEIGHT,
        textTransform: 'uppercase',
        fill: textColor,
        align: 'left',
        baseline: 'top',
      }),
    );
    currentY += TITLE_FONT_SIZE * TITLE_LINE_HEIGHT_MULT;

    // 4. Draw a thin separator line (white 10% opacity)
    const sepY = currentY + SEPARATOR_GAP;
    children.push(
      line({
        x1: textX,
        y1: sepY,
        x2: cardX + cardW,
        y2: sepY,
        stroke: 'rgba(255, 255, 255, 0.1)',
        strokeWidth: SEPARATOR_HEIGHT,
      }),
    );

    // 5. Draw elevation (content.body) at 50% opacity, size 10px
    const elevY = sepY + SEPARATOR_HEIGHT + ELEVATION_GAP;
    children.push(
      text({
        x: textX,
        y: elevY,
        text: content?.body ?? '',
        fontSize: ELEVATION_FONT_SIZE,
        fontFamily,
        fontWeight: ELEVATION_FONT_WEIGHT,
        fill: textColor,
        opacity: 0.5,
        align: 'left',
        baseline: 'top',
      }),
    );

    // 6. Draw a small 4x4 accent-colored square outline at bottom-left
    children.push(
      rect({
        x: cardX - SQUARE_SIZE / 2,
        y: cardY + cardH - SQUARE_SIZE / 2,
        width: SQUARE_SIZE,
        height: SQUARE_SIZE,
        stroke: accentColor,
        strokeWidth: 1,
      }),
    );
  } else {
    // When showMetadata is false:
    // 2. Title only in uppercase
    children.push(
      text({
        x: textX,
        y: currentY,
        text: titleText,
        fontSize: TITLE_FONT_SIZE,
        fontFamily,
        fontWeight: TITLE_FONT_WEIGHT,
        textTransform: 'uppercase',
        fill: textColor,
        align: 'left',
        baseline: 'top',
      }),
    );
  }

  return group({ children });
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export const topoLabelStyle: AnnotationStyleDefinition<TopoLabelSettings> = {
  id: 'topo-label',
  version: 1,
  name: 'Topographic',
  description: 'Military-style label with coordinates and elevation',
  category: 'data',
  icon: 'mountain',
  contentSlots: ['title'],
  settingsSchema: topoLabelSettingsSchema,
  defaultSettings: defaultTopoLabelSettings,
  defaultConnector: {
    visible: true,
    style: 'solid',
    endDot: false,
  },
  controls: [
    { type: 'color', key: 'textColor', label: 'Text color' },
    { type: 'color', key: 'accentColor', label: 'Accent color' },
    { type: 'font', key: 'fontFamily', label: 'Font' },
    { type: 'switch', key: 'showMetadata', label: 'Show coordinates & elevation' },
  ],
  render: renderTopoLabel,
  measure: measureTopoLabel,
  migrate(fromVersion: number, oldSettings: unknown): TopoLabelSettings {
    if (typeof oldSettings === 'object' && oldSettings !== null) {
      const s = oldSettings as Record<string, unknown>;
      return {
        textColor: typeof s.textColor === 'string' ? s.textColor : defaultTopoLabelSettings.textColor,
        accentColor: typeof s.accentColor === 'string' ? s.accentColor : defaultTopoLabelSettings.accentColor,
        fontFamily: typeof s.fontFamily === 'string' ? s.fontFamily : defaultTopoLabelSettings.fontFamily,
        showMetadata: typeof s.showMetadata === 'boolean' ? s.showMetadata : defaultTopoLabelSettings.showMetadata,
      };
    }
    return { ...defaultTopoLabelSettings };
  },
};

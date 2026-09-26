import { z } from 'zod';
import type { AnnotationStyleDefinition, StyleRenderInput, SceneNode } from '../types';
import { group, rect, pill, circle, text, line, shadows } from '../scene/primitives';

// ─── Settings Schema ──────────────────────────────────────────────────────────

export const newsSlugSettingsSchema = z.object({
  bgColor: z.string().default('#0f172a'),
  textColor: z.string().default('#f8fafc'),
  accentColor: z.string().default('#ef4444'),
  fontFamily: z.string().default('Outfit'),
  shadow: z.boolean().default(true),
});

export type NewsSlugSettings = z.infer<typeof newsSlugSettingsSchema>;

const defaultSettings: NewsSlugSettings = {
  bgColor: '#0f172a',
  textColor: '#f8fafc',
  accentColor: '#ef4444',
  fontFamily: 'Outfit',
  shadow: true,
};

// ─── Layout Constants ────────────────────────────────────────────────────────

const PAD_H = 16;
const PAD_V = 8;
const ACCENT_BAR_W = 5;
const FONT_SIZE = 16;
const FONT_WEIGHT = 900;
const LINE_HEIGHT_MULT = 1.2;
const LETTER_SPACING = '-0.02em';

// ─── Text Measurement Cache ──────────────────────────────────────────────────

let cachedCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function getTextWidth(content: string, fontSize: number, fontFamily: string): number {
  if (!content) return 0;
  try {
    if (!cachedCtx) {
      if (typeof OffscreenCanvas !== 'undefined') {
        cachedCtx = new OffscreenCanvas(1, 1).getContext('2d');
      } else if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        cachedCtx = canvas.getContext('2d');
      }
    }
    if (cachedCtx) {
      cachedCtx.font = `${FONT_WEIGHT} ${fontSize}px '${fontFamily}', sans-serif`;
      try {
        (cachedCtx as CanvasRenderingContext2D).letterSpacing = LETTER_SPACING;
      } catch {
        // letterSpacing might not be supported in some environments
      }
      const measured = cachedCtx.measureText(content).width;
      if (measured > 0) return measured;
    }
  } catch {
    // Canvas measurement failed, fall back to approximation
  }
  return content.length * fontSize * 0.65;
}

// ─── Style Definition ────────────────────────────────────────────────────────

export const newsSlugStyle: AnnotationStyleDefinition<NewsSlugSettings> = {
  id: 'news-slug',
  version: 1,
  name: 'News Slug',
  description: 'Bold news-style banner with accent bar',
  category: 'editorial',
  icon: 'flag',
  contentSlots: ['title'],
  settingsSchema: newsSlugSettingsSchema,
  defaultSettings,
  supportsAltitude: true,
  defaultAnchor: 'bottom',
  defaultConnector: {
    visible: false,
  },
  controls: [
    { type: 'color', key: 'bgColor', label: 'Background' },
    { type: 'color', key: 'textColor', label: 'Text color' },
    { type: 'color', key: 'accentColor', label: 'Accent bar' },
    { type: 'font', key: 'fontFamily', label: 'Font' },
    { type: 'switch', key: 'shadow', label: 'Drop shadow' },
  ],

  render(input: StyleRenderInput<NewsSlugSettings>): SceneNode {
    const { content, settings } = input;
    const rawText = content.title ?? '';
    const titleText = rawText.toUpperCase();

    const fontFamily = settings?.fontFamily || defaultSettings.fontFamily;
    const bgColor = settings?.bgColor ?? defaultSettings.bgColor;
    const textColor = settings?.textColor ?? defaultSettings.textColor;
    const accentColor = settings?.accentColor ?? defaultSettings.accentColor;
    const shadow = settings?.shadow ?? defaultSettings.shadow;

    const textWidth = getTextWidth(titleText, FONT_SIZE, fontFamily);
    const cardW = textWidth + PAD_H * 2 + ACCENT_BAR_W;
    const cardH = FONT_SIZE * LINE_HEIGHT_MULT + PAD_V * 2;

    const cardX = -cardW / 2;
    const cardY = -cardH;

    return group({
      children: [
        // 1. Rectangle background (no border radius, optional shadow)
        rect({
          x: cardX,
          y: cardY,
          width: cardW,
          height: cardH,
          fill: bgColor,
          shadow: shadow ? shadows.md : undefined,
        }),
        // 2. 5px wide accent bar on the left edge
        rect({
          x: cardX,
          y: cardY,
          width: ACCENT_BAR_W,
          height: cardH,
          fill: accentColor,
        }),
        // 3. Uppercase heavy weight title text
        text({
          x: cardX + ACCENT_BAR_W + PAD_H,
          y: cardY + cardH / 2,
          text: titleText,
          fontSize: FONT_SIZE,
          fontFamily,
          fontWeight: FONT_WEIGHT,
          letterSpacing: LETTER_SPACING,
          textTransform: 'uppercase',
          align: 'left',
          baseline: 'middle',
          fill: textColor,
        }),
      ],
    });
  },

  measure(input: StyleRenderInput<NewsSlugSettings>): { width: number; height: number } {
    const rawText = input.content.title ?? '';
    const fontFamily = input.settings?.fontFamily || defaultSettings.fontFamily;
    const textWidth = getTextWidth(rawText.toUpperCase(), FONT_SIZE, fontFamily);
    const width = textWidth + PAD_H * 2 + ACCENT_BAR_W;
    const height = FONT_SIZE * LINE_HEIGHT_MULT + PAD_V * 2;
    return { width, height };
  },

  migrate(fromVersion: number, oldSettings: unknown): NewsSlugSettings {
    if (typeof oldSettings === 'object' && oldSettings !== null) {
      const s = oldSettings as Record<string, unknown>;
      return {
        bgColor: typeof s.bgColor === 'string' ? s.bgColor : defaultSettings.bgColor,
        textColor: typeof s.textColor === 'string' ? s.textColor : defaultSettings.textColor,
        accentColor: typeof s.accentColor === 'string' ? s.accentColor : defaultSettings.accentColor,
        fontFamily: typeof s.fontFamily === 'string' ? s.fontFamily : defaultSettings.fontFamily,
        shadow: typeof s.shadow === 'boolean' ? s.shadow : defaultSettings.shadow,
      };
    }
    return { ...defaultSettings };
  },
};

import { z } from 'zod';
import type { AnnotationStyleDefinition, StyleRenderInput, SceneNode } from '../types';
import { group, rect, pill, circle, text, line, shadows } from '../scene/primitives';
import { hexToRgba } from '@/utils/colors';

// ─── Settings Schema ─────────────────────────────────────────────────────────

export const modernPillSettingsSchema = z.object({
  bgColor: z.string().default('#0f172a'),
  textColor: z.string().default('#f8fafc'),
  accentColor: z.string().default('#3b82f6'),
  fontFamily: z.string().default('Outfit'),
  shadow: z.boolean().default(true),
});

export type ModernPillSettings = z.infer<typeof modernPillSettingsSchema>;

const defaultSettings: ModernPillSettings = {
  bgColor: '#0f172a',
  textColor: '#f8fafc',
  accentColor: '#3b82f6',
  fontFamily: 'Outfit',
  shadow: true,
};

// ─── Layout Constants ────────────────────────────────────────────────────────

const PAD_H = 18;
const PAD_V = 8;
const GAP = 10;
const DOT_DIAMETER = 10;
const DOT_RADIUS = DOT_DIAMETER / 2; // 5px
const FONT_SIZE = 14;
const FONT_WEIGHT = 700;

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
      return cachedCtx.measureText(content).width;
    }
  } catch {
    // Canvas measurement failed, fall back to approximation
  }
  return content.length * fontSize * 0.55;
}

// ─── Style Definition ────────────────────────────────────────────────────────

export const modernPillStyle: AnnotationStyleDefinition<ModernPillSettings> = {
  id: 'modern-pill',
  version: 1,
  name: 'Modern Pill',
  description: 'Pill-shaped card with accent dot',
  category: 'card',
  icon: 'bookmark',
  contentSlots: ['title'],
  settingsSchema: modernPillSettingsSchema,
  defaultSettings,
  supportsAltitude: true,
  defaultAnchor: 'bottom',
  defaultConnector: {
    visible: true,
  },
  controls: [
    { type: 'color', key: 'bgColor', label: 'Background' },
    { type: 'color', key: 'textColor', label: 'Text color' },
    { type: 'color', key: 'accentColor', label: 'Accent color' },
    { type: 'font', key: 'fontFamily', label: 'Font' },
    { type: 'switch', key: 'shadow', label: 'Drop shadow' },
  ],

  render(input: StyleRenderInput<ModernPillSettings>): SceneNode {
    const { content, settings } = input;
    const titleText = content.title ?? '';
    const textWidth = getTextWidth(titleText, FONT_SIZE, settings.fontFamily);

    const cardW = DOT_DIAMETER + GAP + textWidth + PAD_H * 2;
    const cardH = Math.max(DOT_DIAMETER, FONT_SIZE * 1.2) + PAD_V * 2;

    const cardX = -cardW / 2;
    const cardY = -cardH;

    const dotX = cardX + PAD_H + DOT_RADIUS;
    const dotY = cardY + cardH / 2;

    const textX = cardX + PAD_H + DOT_DIAMETER + GAP;
    const textY = dotY;

    return group({
      children: [
        pill({
          x: cardX,
          y: cardY,
          width: cardW,
          height: cardH,
          fill: hexToRgba(settings.bgColor, 0.87),
          stroke: 'rgba(255, 255, 255, 0.3)',
          strokeWidth: 1,
          shadow: settings.shadow ? shadows.lg : undefined,
        }),
        circle({
          cx: dotX,
          cy: dotY,
          r: DOT_RADIUS,
          fill: settings.accentColor,
          shadow: shadows.glow(settings.accentColor, 12),
        }),
        text({
          x: textX,
          y: textY,
          text: titleText,
          fontSize: FONT_SIZE,
          fontFamily: settings.fontFamily,
          fontWeight: FONT_WEIGHT,
          fill: settings.textColor,
          align: 'left',
          baseline: 'middle',
        }),
      ],
    });
  },

  measure(input: StyleRenderInput<ModernPillSettings>): { width: number; height: number } {
    const textWidth = getTextWidth(
      input.content.title ?? '',
      FONT_SIZE,
      input.settings.fontFamily,
    );
    const width = DOT_DIAMETER + GAP + textWidth + PAD_H * 2;
    const height = Math.max(DOT_DIAMETER, FONT_SIZE * 1.2) + PAD_V * 2;
    return { width, height };
  },

  migrate(fromVersion: number, oldSettings: unknown): ModernPillSettings {
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

import { z } from 'zod';
import type { AnnotationStyleDefinition, StyleRenderInput, SceneNode } from '../types';
import { group, rect, text, shadows } from '../scene/primitives';

// ─── Settings Schema ──────────────────────────────────────────────────────────

export const standardCardSettingsSchema = z.object({
  bgColor: z.string().default('#0f172a'),
  textColor: z.string().default('#f8fafc'),
  fontFamily: z.string().default('Outfit'),
  borderRadius: z.number().default(8),
  maxWidth: z.number().default(240),
  shadow: z.boolean().default(true),
});

export type StandardCardSettings = z.infer<typeof standardCardSettingsSchema>;

export const defaultStandardCardSettings: StandardCardSettings = {
  bgColor: '#0f172a',
  textColor: '#f8fafc',
  fontFamily: 'Outfit',
  borderRadius: 8,
  maxWidth: 240,
  shadow: true,
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PAD_H = 12;
const PAD_V = 8;
const FONT_SIZE = 14;
const FONT_WEIGHT = 600;
const LINE_HEIGHT_MULT = 1.4;

// ─── Measurement & Render ─────────────────────────────────────────────────────

export function measureStandardCard(
  input: StyleRenderInput<StandardCardSettings>,
): { width: number; height: number } {
  const { content, settings } = input;
  const titleChars = (content?.title ?? '').length;
  const maxWidth = settings?.maxWidth ?? defaultStandardCardSettings.maxWidth;
  const width = Math.min(titleChars * 8 + PAD_H * 2, maxWidth);
  const height = FONT_SIZE * LINE_HEIGHT_MULT + PAD_V * 2;
  return { width, height };
}

export function renderStandardCard(
  input: StyleRenderInput<StandardCardSettings>,
): SceneNode {
  const { content, settings } = input;
  const titleText = content?.title ?? '';

  const bgColor = settings?.bgColor ?? defaultStandardCardSettings.bgColor;
  const textColor = settings?.textColor ?? defaultStandardCardSettings.textColor;
  const fontFamily = settings?.fontFamily ?? defaultStandardCardSettings.fontFamily;
  const borderRadius = settings?.borderRadius ?? defaultStandardCardSettings.borderRadius;
  const shadow = settings?.shadow ?? defaultStandardCardSettings.shadow;

  const { width, height } = measureStandardCard(input);
  const cardX = -width / 2;
  const cardY = -height;

  return group({
    children: [
      rect({
        x: cardX,
        y: cardY,
        width,
        height,
        cornerRadius: borderRadius,
        fill: bgColor,
        stroke: 'rgba(255, 255, 255, 0.2)',
        strokeWidth: 1,
        shadow: shadow ? shadows.md : undefined,
      }),
      text({
        x: 0,
        y: cardY + height / 2,
        text: titleText,
        fontSize: FONT_SIZE,
        fontFamily,
        fontWeight: FONT_WEIGHT,
        fill: textColor,
        align: 'center',
        baseline: 'middle',
        maxWidth: Math.max(0, width - PAD_H * 2),
      }),
    ],
  });
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export const standardCardStyle: AnnotationStyleDefinition<StandardCardSettings> = {
  id: 'standard-card',
  version: 1,
  name: 'Standard Card',
  description: 'Simple card with title text',
  category: 'card',
  icon: 'square',
  contentSlots: ['title'],
  settingsSchema: standardCardSettingsSchema,
  defaultSettings: defaultStandardCardSettings,
  defaultConnector: {
    visible: true,
  },
  controls: [
    { type: 'color', key: 'bgColor', label: 'Background' },
    { type: 'color', key: 'textColor', label: 'Text color' },
    { type: 'font', key: 'fontFamily', label: 'Font' },
    { type: 'slider', key: 'borderRadius', label: 'Corner radius', min: 0, max: 24, step: 1, unit: 'px' },
    { type: 'slider', key: 'maxWidth', label: 'Max width', min: 120, max: 400, step: 5, unit: 'px' },
    { type: 'switch', key: 'shadow', label: 'Drop shadow' },
  ],
  render: renderStandardCard,
  measure: measureStandardCard,
  migrate(_fromVersion: number, oldSettings: unknown): StandardCardSettings {
    if (typeof oldSettings === 'object' && oldSettings !== null) {
      const s = oldSettings as Record<string, unknown>;
      return {
        bgColor: typeof s.bgColor === 'string' ? s.bgColor : defaultStandardCardSettings.bgColor,
        textColor: typeof s.textColor === 'string' ? s.textColor : defaultStandardCardSettings.textColor,
        fontFamily: typeof s.fontFamily === 'string' ? s.fontFamily : defaultStandardCardSettings.fontFamily,
        borderRadius: typeof s.borderRadius === 'number' ? s.borderRadius : defaultStandardCardSettings.borderRadius,
        maxWidth: typeof s.maxWidth === 'number' ? s.maxWidth : defaultStandardCardSettings.maxWidth,
        shadow: typeof s.shadow === 'boolean' ? s.shadow : defaultStandardCardSettings.shadow,
      };
    }
    return { ...defaultStandardCardSettings };
  },
};

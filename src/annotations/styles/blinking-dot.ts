import { z } from 'zod';
import type { AnnotationStyleDefinition, StyleRenderInput, SceneNode } from '../types';
import { group, circle, text, shadows } from '../scene/primitives';
import { hexToRgba } from '@/utils/colors';

// ─── Settings Schema ─────────────────────────────────────────────────────────

export const blinkingDotSettingsSchema = z.object({
  color: z.string().default('#3b82f6'),
  dotRadius: z.number().default(6),
  blinkSpeed: z.number().default(1.5),
  showGlow: z.boolean().default(true),
  glowRadius: z.number().default(16),
  textColor: z.string().default('#f8fafc'),
  fontFamily: z.string().default('Outfit'),
  fontSize: z.number().default(13),
});

export type BlinkingDotSettings = z.infer<typeof blinkingDotSettingsSchema>;

const defaultSettings: BlinkingDotSettings = {
  color: '#3b82f6',
  dotRadius: 6,
  blinkSpeed: 1.5,
  showGlow: true,
  glowRadius: 16,
  textColor: '#f8fafc',
  fontFamily: 'Outfit',
  fontSize: 13,
};

// ─── Layout Constants ────────────────────────────────────────────────────────

const GAP = 8;
const FONT_WEIGHT = 600;

// ─── Text Measurement Cache ──────────────────────────────────────────────────

let cachedCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function getTextWidth(
  content: string,
  fontSize: number,
  fontFamily: string,
  fontWeight = 600,
): number {
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
      cachedCtx.font = `${fontWeight} ${fontSize}px '${fontFamily}', sans-serif`;
      return cachedCtx.measureText(content).width;
    }
  } catch {
    // Canvas measurement failed, fall back to approximation
  }
  return content.length * fontSize * 0.55;
}

// ─── Style Definition ────────────────────────────────────────────────────────

export const blinkingDotStyle: AnnotationStyleDefinition<BlinkingDotSettings> = {
  id: 'blinking-dot',
  version: 1,
  name: 'Blinking Dot',
  description: 'Pulsing dot marker with optional label',
  category: 'marker',
  icon: 'circle-dot',
  contentSlots: ['title'],
  settingsSchema: blinkingDotSettingsSchema,
  defaultSettings,
  defaultConnector: {
    visible: false,
  },
  defaultTransition: {
    enter: 'fade',
    exit: 'fade',
    enterDuration: 0.3,
    exitDuration: 0.3,
  },
  controls: [
    { type: 'color', key: 'color', label: 'Dot color' },
    {
      type: 'slider',
      key: 'dotRadius',
      label: 'Dot size',
      min: 3,
      max: 16,
      step: 1,
      unit: 'px',
    },
    {
      type: 'slider',
      key: 'blinkSpeed',
      label: 'Blink speed',
      min: 0.5,
      max: 4,
      step: 0.1,
      unit: '/s',
    },
    { type: 'switch', key: 'showGlow', label: 'Glow effect' },
    { type: 'color', key: 'textColor', label: 'Text color' },
    { type: 'font', key: 'fontFamily', label: 'Font' },
  ],

  render(input: StyleRenderInput<BlinkingDotSettings>): SceneNode {
    const { content, settings, itemTime } = input;
    const blinkProgress = 0.5 + 0.5 * Math.sin(itemTime * Math.PI * 2 * settings.blinkSpeed);
    const blinkOpacity = 0.3 + 0.7 * blinkProgress;

    const children: SceneNode[] = [];

    // Subtle breathing glow effect behind the dot
    if (settings.showGlow) {
      children.push(
        circle({
          cx: 0,
          cy: 0,
          r: settings.glowRadius,
          fill: hexToRgba(settings.color, 0.25),
          opacity: blinkOpacity,
          shadow: shadows.glow(settings.color, 8),
        }),
      );
    }

    // Main pulsing dot circle
    children.push(
      circle({
        cx: 0,
        cy: 0,
        r: settings.dotRadius,
        fill: settings.color,
        opacity: blinkOpacity,
      }),
    );

    // Optional title text label to the right of the dot
    const titleText = content.title ?? '';
    if (titleText.trim().length > 0) {
      children.push(
        text({
          x: settings.dotRadius + GAP,
          y: 0,
          text: titleText,
          fontSize: settings.fontSize,
          fontFamily: settings.fontFamily,
          fontWeight: FONT_WEIGHT,
          fill: settings.textColor,
          align: 'left',
          baseline: 'middle',
        }),
      );
    }

    return group({ children });
  },

  measure(input: StyleRenderInput<BlinkingDotSettings>): { width: number; height: number } {
    const { content, settings } = input;
    const titleText = content.title ?? '';
    const hasTitle = titleText.trim().length > 0;

    let width: number;
    if (hasTitle) {
      const textWidth = getTextWidth(
        titleText,
        settings.fontSize,
        settings.fontFamily,
        FONT_WEIGHT,
      );
      width = settings.dotRadius * 2 + GAP + textWidth;
    } else {
      width = settings.dotRadius * 2 + settings.glowRadius * 2;
    }

    const height = Math.max(
      settings.dotRadius * 2 + settings.glowRadius * 2,
      settings.fontSize * 1.3,
    );

    return { width, height };
  },

  migrate(fromVersion: number, oldSettings: unknown): BlinkingDotSettings {
    if (typeof oldSettings === 'object' && oldSettings !== null) {
      const s = oldSettings as Record<string, unknown>;
      return {
        color: typeof s.color === 'string' ? s.color : defaultSettings.color,
        dotRadius: typeof s.dotRadius === 'number' ? s.dotRadius : defaultSettings.dotRadius,
        blinkSpeed: typeof s.blinkSpeed === 'number' ? s.blinkSpeed : defaultSettings.blinkSpeed,
        showGlow: typeof s.showGlow === 'boolean' ? s.showGlow : defaultSettings.showGlow,
        glowRadius: typeof s.glowRadius === 'number' ? s.glowRadius : defaultSettings.glowRadius,
        textColor: typeof s.textColor === 'string' ? s.textColor : defaultSettings.textColor,
        fontFamily: typeof s.fontFamily === 'string' ? s.fontFamily : defaultSettings.fontFamily,
        fontSize: typeof s.fontSize === 'number' ? s.fontSize : defaultSettings.fontSize,
      };
    }
    return { ...defaultSettings };
  },
};

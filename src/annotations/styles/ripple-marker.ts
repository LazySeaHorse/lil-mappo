import { z } from 'zod';
import type { AnnotationStyleDefinition, StyleRenderInput, SceneNode } from '../types';
import { group, rect, pill, circle, text, line, shadows } from '../scene/primitives';

// ─── Settings Schema ─────────────────────────────────────────────────────────

export const rippleMarkerSettingsSchema = z.object({
  color: z.string().default('#3b82f6'),
  dotRadius: z.number().default(5),
  rippleRadius: z.number().default(30),
  rippleSpeed: z.number().default(0.8),
  rippleCount: z.number().default(2),
  strokeWidth: z.number().default(2),
  textColor: z.string().default('#f8fafc'),
  fontFamily: z.string().default('Outfit'),
  fontSize: z.number().default(13),
});

export type RippleMarkerSettings = z.infer<typeof rippleMarkerSettingsSchema>;

const defaultSettings: RippleMarkerSettings = {
  color: '#3b82f6',
  dotRadius: 5,
  rippleRadius: 30,
  rippleSpeed: 0.8,
  rippleCount: 2,
  strokeWidth: 2,
  textColor: '#f8fafc',
  fontFamily: 'Outfit',
  fontSize: 13,
};

// ─── Text Measurement Cache ──────────────────────────────────────────────────

const FONT_WEIGHT = 500;
let cachedCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function getTextWidth(
  content: string,
  fontSize: number,
  fontFamily: string,
  fontWeight = FONT_WEIGHT,
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

export const rippleMarkerStyle: AnnotationStyleDefinition<RippleMarkerSettings> = {
  id: 'ripple-marker',
  version: 1,
  name: 'Ripple Marker',
  description: 'Animated expanding rings from center point',
  category: 'marker',
  icon: 'radio',
  contentSlots: ['title'],
  settingsSchema: rippleMarkerSettingsSchema,
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
    { type: 'color', key: 'color', label: 'Color' },
    { type: 'slider', key: 'dotRadius', label: 'Dot size', min: 3, max: 12, step: 1, unit: 'px' },
    { type: 'slider', key: 'rippleRadius', label: 'Ripple size', min: 15, max: 60, step: 1, unit: 'px' },
    { type: 'slider', key: 'rippleSpeed', label: 'Speed', min: 0.3, max: 2, step: 0.1, unit: '/s' },
    { type: 'slider', key: 'rippleCount', label: 'Ring count', min: 1, max: 4, step: 1 },
    { type: 'color', key: 'textColor', label: 'Text color' },
    { type: 'font', key: 'fontFamily', label: 'Font' },
  ],

  render(input: StyleRenderInput<RippleMarkerSettings>): SceneNode {
    const { content, settings, itemTime } = input;
    const children: SceneNode[] = [];

    // 1. Concentric ripple rings radiating outward
    const count = Math.max(1, Math.round(settings.rippleCount));
    for (let i = 0; i < count; i++) {
      const phase = ((itemTime * settings.rippleSpeed) + i / count) % 1;
      const normalizedPhase = ((phase % 1) + 1) % 1;
      const ringRadius =
        settings.dotRadius + normalizedPhase * (settings.rippleRadius - settings.dotRadius);
      const ringOpacity = (1 - normalizedPhase) * 0.6;

      children.push(
        circle({
          cx: 0,
          cy: 0,
          r: ringRadius,
          stroke: settings.color,
          strokeWidth: settings.strokeWidth,
          opacity: ringOpacity,
        }),
      );
    }

    // 2. Center dot (solid fill)
    children.push(
      circle({
        cx: 0,
        cy: 0,
        r: settings.dotRadius,
        fill: settings.color,
      }),
    );

    // 3. Optional label text to the right, 8px gap from the ripple edge
    if (content.title) {
      children.push(
        text({
          x: settings.rippleRadius + 8,
          y: 0,
          text: content.title,
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

  measure(input: StyleRenderInput<RippleMarkerSettings>): { width: number; height: number } {
    const { content, settings } = input;
    const baseDiameter = settings.rippleRadius * 2;
    const gap = 8;
    const hasTitle = Boolean(content.title);
    const textWidth = hasTitle
      ? getTextWidth(content.title!, settings.fontSize, settings.fontFamily, FONT_WEIGHT)
      : 0;

    return {
      width: baseDiameter + (hasTitle ? gap + textWidth : 0),
      height: baseDiameter,
    };
  },

  migrate(fromVersion: number, oldSettings: unknown): RippleMarkerSettings {
    if (typeof oldSettings === 'object' && oldSettings !== null) {
      const s = oldSettings as Record<string, unknown>;
      return {
        color: typeof s.color === 'string' ? s.color : defaultSettings.color,
        dotRadius: typeof s.dotRadius === 'number' ? s.dotRadius : defaultSettings.dotRadius,
        rippleRadius:
          typeof s.rippleRadius === 'number' ? s.rippleRadius : defaultSettings.rippleRadius,
        rippleSpeed:
          typeof s.rippleSpeed === 'number' ? s.rippleSpeed : defaultSettings.rippleSpeed,
        rippleCount:
          typeof s.rippleCount === 'number' ? s.rippleCount : defaultSettings.rippleCount,
        strokeWidth:
          typeof s.strokeWidth === 'number' ? s.strokeWidth : defaultSettings.strokeWidth,
        textColor: typeof s.textColor === 'string' ? s.textColor : defaultSettings.textColor,
        fontFamily: typeof s.fontFamily === 'string' ? s.fontFamily : defaultSettings.fontFamily,
        fontSize: typeof s.fontSize === 'number' ? s.fontSize : defaultSettings.fontSize,
      };
    }
    return { ...defaultSettings };
  },
};

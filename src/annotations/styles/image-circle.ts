import { z } from 'zod';
import type { AnnotationStyleDefinition, StyleRenderInput, SceneNode } from '../types';
import { group, circle, text, image, shadows } from '../scene/primitives';

// ─── Settings Schema ─────────────────────────────────────────────────────────

export const imageCircleSettingsSchema = z.object({
  borderColor: z.string().default('#ffffff'),
  borderWidth: z.number().default(3),
  size: z.number().default(48),
  showShadow: z.boolean().default(true),
  textColor: z.string().default('#f8fafc'),
  fontFamily: z.string().default('Outfit'),
  fontSize: z.number().default(12),
  labelPosition: z.enum(['bottom', 'right']).default('bottom'),
});

export type ImageCircleSettings = z.infer<typeof imageCircleSettingsSchema>;

export const defaultImageCircleSettings: ImageCircleSettings = {
  borderColor: '#ffffff',
  borderWidth: 3,
  size: 48,
  showShadow: true,
  textColor: '#f8fafc',
  fontFamily: 'Outfit',
  fontSize: 12,
  labelPosition: 'bottom',
};

// ─── Constants & Measurement ──────────────────────────────────────────────────

const GAP = 8;
const FONT_WEIGHT = 500;

let contextChecked = false;
let cachedCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function getTextWidth(
  content: string,
  fontSize: number,
  fontFamily: string,
  fontWeight = FONT_WEIGHT,
): number {
  if (!content) return 0;
  if (!contextChecked) {
    contextChecked = true;
    try {
      if (typeof OffscreenCanvas !== 'undefined') {
        cachedCtx = new OffscreenCanvas(1, 1).getContext('2d');
      } else if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        cachedCtx = canvas.getContext('2d');
      }
    } catch {
      cachedCtx = null;
    }
  }

  if (cachedCtx) {
    try {
      cachedCtx.font = `${fontWeight} ${fontSize}px '${fontFamily}', sans-serif`;
      return cachedCtx.measureText(content).width;
    } catch {
      // Canvas measurement failed, fall back to approximation
    }
  }
  return content.length * fontSize * 0.55;
}

// ─── Style Definition ────────────────────────────────────────────────────────

export const imageCircleStyle: AnnotationStyleDefinition<ImageCircleSettings> = {
  id: 'image-circle',
  version: 1,
  name: 'Image Circle',
  description: 'Circular image with border and optional label',
  category: 'media',
  icon: 'image',
  contentSlots: ['title', 'image'],
  settingsSchema: imageCircleSettingsSchema,
  defaultSettings: defaultImageCircleSettings,
  supportsAltitude: false,
  defaultAnchor: 'center',
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
    { type: 'color', key: 'borderColor', label: 'Border color' },
    { type: 'slider', key: 'borderWidth', label: 'Border width', min: 1, max: 8, step: 0.5, unit: 'px' },
    { type: 'slider', key: 'size', label: 'Size', min: 24, max: 96, step: 2, unit: 'px' },
    { type: 'switch', key: 'showShadow', label: 'Drop shadow' },
    { type: 'color', key: 'textColor', label: 'Text color' },
    { type: 'font', key: 'fontFamily', label: 'Font' },
    {
      type: 'select',
      key: 'labelPosition',
      label: 'Label position',
      options: [
        { value: 'bottom', label: 'Bottom' },
        { value: 'right', label: 'Right' },
      ],
    },
  ],

  render(input: StyleRenderInput<ImageCircleSettings>): SceneNode {
    const { content, settings } = input;
    const radius = settings.size / 2;
    const children: SceneNode[] = [];

    // 1. Draw outer ring: circle with stroke only at (0, 0), r = size/2, stroke = borderColor, strokeWidth = borderWidth. Optional shadow.
    children.push(
      circle({
        cx: 0,
        cy: 0,
        r: radius,
        stroke: settings.borderColor,
        strokeWidth: settings.borderWidth,
        shadow: settings.showShadow ? shadows.md : undefined,
      }),
    );

    // 2. Draw image circle: image node centered at (0,0) offset, using cornerRadius = size/2 for circular clip, objectFit 'cover'. Use content.image as src. If no image, draw a fallback circle with a subtle fill.
    if (content.image) {
      children.push(
        image({
          x: -radius,
          y: -radius,
          width: settings.size,
          height: settings.size,
          src: content.image,
          cornerRadius: radius,
          objectFit: 'cover',
        }),
      );
    } else {
      children.push(
        circle({
          cx: 0,
          cy: 0,
          r: radius,
          fill: 'rgba(255, 255, 255, 0.1)',
        }),
      );
    }

    // 3. If content.title exists:
    //    - If labelPosition === 'bottom': text below the circle, centered
    //    - If labelPosition === 'right': text to the right of the circle
    if (content.title) {
      const isBottom = settings.labelPosition === 'bottom';
      const textX = isBottom ? 0 : radius + settings.borderWidth + GAP;
      const textY = isBottom ? radius + settings.borderWidth + GAP : 0;

      children.push(
        text({
          x: textX,
          y: textY,
          text: content.title,
          fontSize: settings.fontSize,
          fontFamily: settings.fontFamily,
          fontWeight: FONT_WEIGHT,
          fill: settings.textColor,
          align: isBottom ? 'center' : 'left',
          baseline: isBottom ? 'top' : 'middle',
        }),
      );
    }

    return group({ children });
  },

  measure(input: StyleRenderInput<ImageCircleSettings>): { width: number; height: number } {
    const { content, settings } = input;
    const circleOuterSize = settings.size + settings.borderWidth * 2;
    const hasTitle = Boolean(content.title);

    if (!hasTitle) {
      return { width: circleOuterSize, height: circleOuterSize };
    }

    const textWidth = getTextWidth(
      content.title!,
      settings.fontSize,
      settings.fontFamily,
      FONT_WEIGHT,
    );

    if (settings.labelPosition === 'bottom') {
      return {
        width: Math.max(circleOuterSize, textWidth),
        height: circleOuterSize + GAP + settings.fontSize,
      };
    }

    return {
      width: circleOuterSize + GAP + textWidth,
      height: circleOuterSize,
    };
  },

  migrate(_fromVersion: number, oldSettings: unknown): ImageCircleSettings {
    if (typeof oldSettings === 'object' && oldSettings !== null) {
      const s = oldSettings as Record<string, unknown>;
      return {
        borderColor:
          typeof s.borderColor === 'string' ? s.borderColor : defaultImageCircleSettings.borderColor,
        borderWidth:
          typeof s.borderWidth === 'number' ? s.borderWidth : defaultImageCircleSettings.borderWidth,
        size: typeof s.size === 'number' ? s.size : defaultImageCircleSettings.size,
        showShadow:
          typeof s.showShadow === 'boolean' ? s.showShadow : defaultImageCircleSettings.showShadow,
        textColor:
          typeof s.textColor === 'string' ? s.textColor : defaultImageCircleSettings.textColor,
        fontFamily:
          typeof s.fontFamily === 'string' ? s.fontFamily : defaultImageCircleSettings.fontFamily,
        fontSize: typeof s.fontSize === 'number' ? s.fontSize : defaultImageCircleSettings.fontSize,
        labelPosition:
          s.labelPosition === 'right' || s.labelPosition === 'bottom'
            ? s.labelPosition
            : defaultImageCircleSettings.labelPosition,
      };
    }
    return { ...defaultImageCircleSettings };
  },
};

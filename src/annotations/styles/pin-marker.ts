import { z } from 'zod';
import type { AnnotationStyleDefinition, StyleRenderInput, SceneNode } from '../types';
import { group, circle, text, path, shadows } from '../scene/primitives';

// ─── Settings Schema ─────────────────────────────────────────────────────────

export const pinMarkerSettingsSchema = z.object({
  color: z.string().default('#ef4444'),
  size: z.number().default(36),
  iconSize: z.number().default(16),
  strokeColor: z.string().default('#ffffff'),
  strokeWidth: z.number().default(2),
  shadow: z.boolean().default(true),
});

export type PinMarkerSettings = z.infer<typeof pinMarkerSettingsSchema>;

export const defaultPinMarkerSettings: PinMarkerSettings = {
  color: '#ef4444',
  size: 36,
  iconSize: 16,
  strokeColor: '#ffffff',
  strokeWidth: 2,
  shadow: true,
};

// ─── Layout Constants ────────────────────────────────────────────────────────

export const TITLE_FONT_SIZE = 12;
export const TITLE_GAP = 8;
export const TITLE_FONT_WEIGHT = 600;
export const TITLE_FONT_FAMILY = 'Outfit';
export const TITLE_COLOR = '#f8fafc';

// ─── Teardrop Path Calculation ───────────────────────────────────────────────

/**
 * Computes the SVG path string for a classic teardrop pin shape.
 *
 * Pin bottom point is at (0, 0) (anchor point).
 * The pin extends upward to -size.
 * The top circle has radius r = size * 0.35, centered at (0, -(size - r)).
 * Tangent lines from (0, 0) connect smoothly to the circle arc.
 */
export function getPinPath(size: number): string {
  const r = size * 0.35;
  const cy = -(size - r);
  const d = size - r;
  const sinA = r / d;
  const cosA = Math.sqrt(Math.max(0, 1 - sinA * sinA));
  const lx = -r * cosA;
  const ly = cy + r * sinA;
  const rx = r * cosA;
  const ry = ly;

  return `M 0,0 L ${lx.toFixed(2)},${ly.toFixed(2)} A ${r.toFixed(2)},${r.toFixed(2)} 0 1,1 ${rx.toFixed(2)},${ry.toFixed(2)} Z`;
}

// ─── Text Measurement Cache ──────────────────────────────────────────────────

let cachedCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

export function getTextWidth(
  content: string,
  fontSize: number,
  fontFamily: string,
  fontWeight = TITLE_FONT_WEIGHT,
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

// ─── Measurement & Render ─────────────────────────────────────────────────────

export function measurePinMarker(
  input: StyleRenderInput<PinMarkerSettings>,
): { width: number; height: number } {
  const { content, settings } = input;
  const size = settings?.size ?? defaultPinMarkerSettings.size;
  const strokeWidth = settings?.strokeWidth ?? defaultPinMarkerSettings.strokeWidth;
  const hasTitle = Boolean(content?.title && content.title.trim().length > 0);

  const width = size * 0.7 + strokeWidth * 2;
  const height = size + (hasTitle ? TITLE_FONT_SIZE + TITLE_GAP : 0);

  return { width, height };
}

export function renderPinMarker(input: StyleRenderInput<PinMarkerSettings>): SceneNode {
  const { content, settings } = input;
  const size = settings?.size ?? defaultPinMarkerSettings.size;
  const color = settings?.color ?? defaultPinMarkerSettings.color;
  const iconSize = settings?.iconSize ?? defaultPinMarkerSettings.iconSize;
  const strokeColor = settings?.strokeColor ?? defaultPinMarkerSettings.strokeColor;
  const strokeWidth = settings?.strokeWidth ?? defaultPinMarkerSettings.strokeWidth;
  const shadow = settings?.shadow ?? defaultPinMarkerSettings.shadow;

  const r = size * 0.35;
  const cy = -(size - r);
  const innerR = r * 0.65;

  const children: SceneNode[] = [];

  // 1. Teardrop pin body path
  children.push(
    path({
      d: getPinPath(size),
      fill: color,
      stroke: strokeColor,
      strokeWidth,
      shadow: shadow ? shadows.md : undefined,
    }),
  );

  // 2. White inner circle for icon background
  children.push(
    circle({
      cx: 0,
      cy,
      r: innerR,
      fill: '#ffffff',
    }),
  );

  // 3. Icon / emoji inside circle, or center dot if no icon
  const iconText = content?.icon?.trim();
  if (iconText && iconText.length > 0) {
    children.push(
      text({
        x: 0,
        y: cy,
        text: iconText,
        fontSize: iconSize,
        fontFamily: 'sans-serif',
        align: 'center',
        baseline: 'middle',
      }),
    );
  } else {
    children.push(
      circle({
        cx: 0,
        cy,
        r: innerR * 0.45,
        fill: color,
      }),
    );
  }

  // 4. Optional title text below the pin
  const titleText = content?.title?.trim();
  if (titleText && titleText.length > 0) {
    children.push(
      text({
        x: 0,
        y: TITLE_GAP,
        text: titleText,
        fontSize: TITLE_FONT_SIZE,
        fontFamily: TITLE_FONT_FAMILY,
        fontWeight: TITLE_FONT_WEIGHT,
        fill: TITLE_COLOR,
        align: 'center',
        baseline: 'top',
      }),
    );
  }

  return group({ children });
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export const pinMarkerStyle: AnnotationStyleDefinition<PinMarkerSettings> = {
  id: 'pin-marker',
  version: 1,
  name: 'Pin Marker',
  description: 'Classic map pin with icon',
  category: 'marker',
  icon: 'map-pin',
  contentSlots: ['title', 'icon'],
  settingsSchema: pinMarkerSettingsSchema,
  defaultSettings: defaultPinMarkerSettings,
  supportsAltitude: false,
  defaultAnchor: 'bottom',
  defaultConnector: {
    visible: false,
  },
  defaultTransition: {
    enter: 'scale-up',
    exit: 'scale-down',
    enterDuration: 0.3,
    exitDuration: 0.2,
  },
  controls: [
    { type: 'color', key: 'color', label: 'Pin color' },
    { type: 'slider', key: 'size', label: 'Size', min: 24, max: 64, step: 2, unit: 'px' },
    { type: 'color', key: 'strokeColor', label: 'Border' },
    { type: 'slider', key: 'strokeWidth', label: 'Border width', min: 0, max: 4, step: 0.5, unit: 'px' },
    { type: 'switch', key: 'shadow', label: 'Drop shadow' },
  ],
  render: renderPinMarker,
  measure: measurePinMarker,
  migrate(fromVersion: number, oldSettings: unknown): PinMarkerSettings {
    if (typeof oldSettings === 'object' && oldSettings !== null) {
      const s = oldSettings as Record<string, unknown>;
      return {
        color: typeof s.color === 'string' ? s.color : defaultPinMarkerSettings.color,
        size: typeof s.size === 'number' ? s.size : defaultPinMarkerSettings.size,
        iconSize: typeof s.iconSize === 'number' ? s.iconSize : defaultPinMarkerSettings.iconSize,
        strokeColor:
          typeof s.strokeColor === 'string' ? s.strokeColor : defaultPinMarkerSettings.strokeColor,
        strokeWidth:
          typeof s.strokeWidth === 'number' ? s.strokeWidth : defaultPinMarkerSettings.strokeWidth,
        shadow: typeof s.shadow === 'boolean' ? s.shadow : defaultPinMarkerSettings.shadow,
      };
    }
    return { ...defaultPinMarkerSettings };
  },
};

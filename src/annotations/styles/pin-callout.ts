import { z } from 'zod';
import type { AnnotationStyleDefinition, SceneNode, StyleBounds, StyleRenderInput } from '../types';
import { ANNOTATION_FONTS } from '../fonts';
import { buildProgress, easeInOutCubic, easeOutBack, easeOutCubic, lerp, stage } from '../motion';
import { circle, group, polyline, text } from '../scene/primitives';
import { measureTextWidth } from '../scene/textMetrics';
import {
  boundsOf,
  HALO_CONTROL,
  HALO_REACH,
  haloSchema,
  haloShadow,
  resolveDirection,
  SIDE_CONTROL,
  sideSchema,
} from './shared';

// ─── Settings Schema ──────────────────────────────────────────────────────────

export const pinCalloutSettingsSchema = z.object({
  accentColor: z.string().default('#FFE600'),
  textColor: z.string().default('#FFFFFF'),
  halo: haloSchema,
  side: sideSchema,
  lineWidth: z.number().default(2.5),
  pulse: z.boolean().default(true),
});

export type PinCalloutSettings = z.infer<typeof pinCalloutSettingsSchema>;

export const defaultPinCalloutSettings: PinCalloutSettings = pinCalloutSettingsSchema.parse({});

// ─── Layout Constants ─────────────────────────────────────────────────────────

const FONT = ANNOTATION_FONTS.body;
const TITLE_SIZE = 34;
const TITLE_WEIGHT = 800;
const TITLE_SPACING = '0.02em';
/** Space between the shelf and the title baseline. */
const TITLE_GAP = 9;
const SUBTITLE_SIZE = 16;
const SUBTITLE_WEIGHT = 600;
const SUBTITLE_OPACITY = 0.9;
const SUBTITLE_GAP = 8;
const SUBTITLE_TRAVEL = 6;
/** Room at each end of the shelf around the text. */
const SHELF_PAD = 8;
const MIN_SHELF_LENGTH = 72;

const DOT_RADIUS = 11;
const RING_RADIUS = 21;
const RING_WIDTH = 2;
const BURST_RADIUS = 36;
const PULSE_RADIUS = 38;
const PULSE_PERIOD = 2.2;

/** Entrance timeline, as overlapping windows of the 0–1 build progress. */
const DOT_WINDOW = [0, 0.2] as const;
const RING_WINDOW = [0.04, 0.36] as const;
const BURST_WINDOW = [0.08, 0.5] as const;
const CONNECTOR_WINDOW = [0.2, 0.55] as const;
const SHELF_WINDOW = [0.45, 0.78] as const;
const TITLE_WINDOW = [0.6, 0.92] as const;
const SUBTITLE_WINDOW = [0.78, 1] as const;

// ─── Layout ───────────────────────────────────────────────────────────────────

type Pt = [number, number];

interface Layout {
  direction: 1 | -1;
  shelfLength: number;
  title: string;
  subtitle: string;
}

function layout(input: StyleRenderInput<PinCalloutSettings>): Layout {
  const { content, settings, ground } = input;
  const title = (content.title ?? '').trim().toUpperCase();
  const subtitle = (content.subtitle ?? '').trim();
  const titleWidth = title ? measureTextWidth(title, TITLE_SIZE, FONT, TITLE_WEIGHT, TITLE_SPACING) : 0;
  const subtitleWidth = subtitle ? measureTextWidth(subtitle, SUBTITLE_SIZE, FONT, SUBTITLE_WEIGHT) : 0;
  return {
    direction: resolveDirection(settings.side, ground.x),
    shelfLength: Math.max(Math.ceil(Math.max(titleWidth, subtitleWidth)) + SHELF_PAD * 2, MIN_SHELF_LENGTH),
    title,
    subtitle,
  };
}

/**
 * The line from the pin to the start of the shelf: straight up from the pin,
 * then a 45° run into the shelf. Where the pin is not far enough below the
 * shelf for that, it is one straight line. It starts at the edge of the ring,
 * not at the pin's centre, however short its first leg.
 */
function connectorPoints(ground: { x: number; y: number }): Pt[] {
  const start: Pt = [ground.x, ground.y];
  const rise = Math.min(Math.abs(ground.x), ground.y);
  const points: Pt[] = rise > 0 && ground.y > rise ? [start, [ground.x, rise], [0, 0]] : [start, [0, 0]];

  // Walk the ring's radius along the line: legs that end inside the ring are dropped.
  let remaining = RING_RADIUS;
  while (points.length > 2) {
    const length = Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
    if (length > remaining) break;
    remaining -= length;
    points.shift();
  }
  const [from, next] = points;
  const length = Math.hypot(next[0] - from[0], next[1] - from[1]);
  if (length <= remaining) return points;
  const t = remaining / length;
  return [[lerp(from[0], next[0], t), lerp(from[1], next[1], t)], ...points.slice(1)];
}

// ─── Render ───────────────────────────────────────────────────────────────────

export function renderPinCallout(input: StyleRenderInput<PinCalloutSettings>): SceneNode {
  const { settings, ground, phase, phaseProgress, itemTime } = input;
  const { direction, shelfLength, title, subtitle } = layout(input);
  const build = buildProgress(phase, phaseProgress);
  const { accentColor } = settings;

  const dot = stage(build, ...DOT_WINDOW, easeOutBack);
  const ring = stage(build, ...RING_WINDOW, easeOutCubic);
  const burst = stage(build, ...BURST_WINDOW, easeOutCubic);
  const connector = stage(build, ...CONNECTOR_WINDOW, easeInOutCubic);
  const shelf = stage(build, ...SHELF_WINDOW, easeOutCubic);
  const titleReveal = stage(build, ...TITLE_WINDOW, easeOutCubic);
  const subtitleReveal = stage(build, ...SUBTITLE_WINDOW, easeOutCubic);

  const shadow = haloShadow(settings.halo);
  const line = { stroke: accentColor, strokeWidth: settings.lineWidth, lineCap: 'round' as const, lineJoin: 'round' as const, shadow };
  const children: SceneNode[] = [];

  if (connector > 0) children.push(polyline({ points: connectorPoints(ground), progress: connector, ...line }));
  if (shelf > 0) children.push(polyline({ points: [[0, 0], [direction * shelfLength, 0]], progress: shelf, ...line }));

  // The ring draws itself round the pin from twelve o'clock.
  if (ring > 0) {
    const top = -Math.PI / 2;
    children.push(circle({
      cx: ground.x,
      cy: ground.y,
      r: RING_RADIUS,
      startAngle: top,
      endAngle: top + Math.PI * 2 * ring,
      stroke: accentColor,
      strokeWidth: RING_WIDTH,
      lineCap: 'round',
      shadow,
    }));
  }

  if (dot > 0) {
    children.push(group({
      x: ground.x,
      y: ground.y,
      scale: dot,
      children: [circle({ cx: 0, cy: 0, r: DOT_RADIUS, fill: accentColor, shadow })],
    }));
  }

  // One wide ring thrown out as the pin lands, then, if wanted, a steady ripple.
  if (burst > 0 && burst < 1) {
    children.push(circle({
      cx: ground.x,
      cy: ground.y,
      r: lerp(RING_RADIUS, BURST_RADIUS, burst),
      stroke: accentColor,
      strokeWidth: 2,
      opacity: 0.8 * (1 - burst),
    }));
  }
  // Only once built, so the last frame of the entrance is the first of the steady state.
  if (settings.pulse && build >= 1) {
    const ripple = easeOutCubic((itemTime / PULSE_PERIOD) % 1);
    children.push(circle({
      cx: ground.x,
      cy: ground.y,
      r: lerp(RING_RADIUS, PULSE_RADIUS, ripple),
      stroke: accentColor,
      strokeWidth: 1.5,
      opacity: 0.7 * (1 - ripple),
    }));
  }

  const textX = direction * SHELF_PAD;
  const textAlign = direction === 1 ? 'left' : 'right';

  if (title && titleReveal > 0) {
    // The title rises from behind the shelf: the clip ends at the line.
    const travel = TITLE_SIZE + TITLE_GAP;
    const clipTop = -(travel + HALO_REACH);
    children.push(group({
      clip: {
        x: Math.min(0, direction * shelfLength) - HALO_REACH,
        y: clipTop,
        width: shelfLength + HALO_REACH * 2,
        height: -clipTop - settings.lineWidth / 2,
      },
      children: [
        group({
          y: (1 - titleReveal) * travel,
          children: [
            text({
              x: textX,
              y: -TITLE_GAP,
              text: title,
              fontSize: TITLE_SIZE,
              fontFamily: FONT,
              fontWeight: TITLE_WEIGHT,
              letterSpacing: TITLE_SPACING,
              fill: settings.textColor,
              align: textAlign,
              baseline: 'alphabetic',
              shadow,
            }),
          ],
        }),
      ],
    }));
  }

  if (subtitle && subtitleReveal > 0) {
    children.push(text({
      x: textX,
      y: SUBTITLE_GAP - (1 - subtitleReveal) * SUBTITLE_TRAVEL,
      text: subtitle,
      fontSize: SUBTITLE_SIZE,
      fontFamily: FONT,
      fontWeight: SUBTITLE_WEIGHT,
      fill: settings.textColor,
      align: textAlign,
      baseline: 'top',
      opacity: subtitleReveal * SUBTITLE_OPACITY,
      shadow,
    }));
  }

  return group({ children });
}

// ─── Measure ──────────────────────────────────────────────────────────────────

/** Bounds of the finished state, widened to the ripple when it is on. */
export function measurePinCallout(input: StyleRenderInput<PinCalloutSettings>): StyleBounds {
  const { ground, settings } = input;
  const finished = renderPinCallout({ ...input, phase: 'visible', phaseProgress: 1 });
  const rippleExtent = settings.pulse
    ? [circle({ cx: ground.x, cy: ground.y, r: PULSE_RADIUS, stroke: settings.accentColor })]
    : [];
  return boundsOf(finished, ...rippleExtent);
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export const pinCalloutStyle: AnnotationStyleDefinition<PinCalloutSettings> = {
  id: 'pin-callout',
  version: 1,
  name: 'Pin Callout',
  description: 'A big pin with a ring that draws on, a bent line to a shelf, and a heavy title rising above it',
  category: 'label',
  icon: 'map-pin',
  contentSlots: ['title', 'subtitle'],
  settingsSchema: pinCalloutSettingsSchema,
  defaultSettings: defaultPinCalloutSettings,
  supportsAltitude: true,
  defaultAltitude: 0,
  defaultOffset: [80, -90],
  drawsConnector: true,
  defaultConnector: { visible: false },
  defaultTransition: {
    enter: 'auto',
    exit: 'auto',
    enterDuration: 1.3,
    exitDuration: 0.5,
  },
  controls: [
    { type: 'color', key: 'accentColor', label: 'Pin color', role: 'accent' },
    { type: 'color', key: 'textColor', label: 'Text color' },
    HALO_CONTROL,
    SIDE_CONTROL,
    { type: 'slider', key: 'lineWidth', label: 'Line width', min: 1.5, max: 5, step: 0.5, unit: 'px' },
    { type: 'switch', key: 'pulse', label: 'Ripple' },
  ],
  render: renderPinCallout,
  measure: measurePinCallout,
};

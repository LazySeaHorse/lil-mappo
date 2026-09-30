import { z } from 'zod';
import type { AnnotationStyleDefinition, SceneNode, StyleBounds, StyleRenderInput } from '../types';
import { ANNOTATION_FONTS } from '../fonts';
import {
  buildProgress,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  lerp,
  stage,
} from '../motion';
import { measureScene } from '../scene/measure';
import { circle, group, polyline, text } from '../scene/primitives';
import { measureTextWidth } from '../scene/textMetrics';

// ─── Settings Schema ──────────────────────────────────────────────────────────

export const leaderLineSettingsSchema = z.object({
  lineColor: z.string().default('#FFFFFF'),
  accentColor: z.string().default('#FF5A36'),
  textColor: z.string().default('#FFFFFF'),
  halo: z.boolean().default(true),
  side: z.enum(['auto', 'left', 'right']).default('auto'),
  lineWidth: z.number().default(1.5),
  pulse: z.boolean().default(false),
});

export type LeaderLineSettings = z.infer<typeof leaderLineSettingsSchema>;

export const defaultLeaderLineSettings: LeaderLineSettings = {
  lineColor: '#FFFFFF',
  accentColor: '#FF5A36',
  textColor: '#FFFFFF',
  halo: true,
  side: 'auto',
  lineWidth: 1.5,
  pulse: false,
};

// ─── Layout Constants ─────────────────────────────────────────────────────────

const TITLE_SIZE = 22;
const TITLE_WEIGHT = 600;
const TITLE_SPACING = '0.06em';
/** Space between the shelf and the title baseline. */
const TITLE_GAP = 7;
const SUBTITLE_SIZE = 14;
const SUBTITLE_WEIGHT = 500;
const SUBTITLE_OPACITY = 0.85;
/** Space between the shelf and the top of the subtitle. */
const SUBTITLE_GAP = 6;
/** Slide the subtitle travels while fading in. */
const SUBTITLE_TRAVEL = 6;
/** Room at each end of the shelf around the text. */
const SHELF_PAD = 6;
const MIN_SHELF_LENGTH = 48;

const DOT_RADIUS = 4;
const RING_RADIUS = 8;
const BURST_RADIUS = 16;
const PULSE_RADIUS = 18;
const PULSE_PERIOD = 2.4;

const HALO_COLOR = 'rgba(0, 0, 0, 0.6)';
const HALO_TEXT_WIDTH = 5;
const HALO_LINE_COLOR = 'rgba(0, 0, 0, 0.35)';
const HALO_LINE_EXTRA = 2;

/**
 * Entrance timeline, as windows of the 0–1 build progress. They overlap so the
 * motion flows: each part starts before the previous one has finished. The exit
 * plays the same timeline backwards.
 */
const DOT_WINDOW = [0, 0.25] as const;
const BURST_WINDOW = [0.04, 0.4] as const;
const DIAGONAL_WINDOW = [0.12, 0.5] as const;
const SHELF_WINDOW = [0.4, 0.75] as const;
const TITLE_WINDOW = [0.6, 0.9] as const;
const SUBTITLE_WINDOW = [0.75, 1] as const;

// ─── Layout ───────────────────────────────────────────────────────────────────

/** +1 when the label extends right of the elbow, -1 when it extends left. */
export function resolveDirection(side: LeaderLineSettings['side'], groundX: number): 1 | -1 {
  if (side === 'left') return -1;
  if (side === 'right') return 1;
  // Auto: the label extends away from the point, so the point is on the near side.
  return groundX > 0 ? -1 : 1;
}

interface Layout {
  direction: 1 | -1;
  shelfLength: number;
  title: string;
  subtitle: string;
}

function layout(input: StyleRenderInput<LeaderLineSettings>): Layout {
  const { content, settings, ground } = input;
  const title = (content.title ?? '').trim().toUpperCase();
  const subtitle = (content.subtitle ?? '').trim();

  const titleWidth = title
    ? measureTextWidth(title, TITLE_SIZE, ANNOTATION_FONTS.condensed, TITLE_WEIGHT, TITLE_SPACING)
    : 0;
  const subtitleWidth = subtitle
    ? measureTextWidth(subtitle, SUBTITLE_SIZE, ANNOTATION_FONTS.condensed, SUBTITLE_WEIGHT)
    : 0;

  return {
    direction: resolveDirection(settings.side, ground.x),
    shelfLength: Math.max(Math.ceil(Math.max(titleWidth, subtitleWidth)) + SHELF_PAD * 2, MIN_SHELF_LENGTH),
    title,
    subtitle,
  };
}

// ─── Render ───────────────────────────────────────────────────────────────────

export function renderLeaderLine(input: StyleRenderInput<LeaderLineSettings>): SceneNode {
  const { settings, ground, phase, phaseProgress, itemTime } = input;
  const { direction, shelfLength, title, subtitle } = layout(input);
  const build = buildProgress(phase, phaseProgress);

  const dot = stage(build, ...DOT_WINDOW, easeOutBack);
  const burst = stage(build, ...BURST_WINDOW, easeOutCubic);
  const diagonal = stage(build, ...DIAGONAL_WINDOW, easeInOutCubic);
  const shelf = stage(build, ...SHELF_WINDOW, easeOutCubic);
  const titleReveal = stage(build, ...TITLE_WINDOW, easeOutCubic);
  const subtitleReveal = stage(build, ...SUBTITLE_WINDOW, easeOutCubic);

  const leaders = [
    { points: [[ground.x, ground.y], [0, 0]] as Array<[number, number]>, progress: diagonal },
    { points: [[0, 0], [direction * shelfLength, 0]] as Array<[number, number]>, progress: shelf },
  ].filter((leader) => leader.progress > 0);

  const children: SceneNode[] = [];

  // Dark underlay first, so it never overlaps a neighbouring line.
  if (settings.halo) {
    for (const { points, progress } of leaders) {
      children.push(polyline({
        points,
        progress,
        stroke: HALO_LINE_COLOR,
        strokeWidth: settings.lineWidth + HALO_LINE_EXTRA,
        lineCap: 'round',
      }));
    }
  }
  for (const { points, progress } of leaders) {
    children.push(polyline({
      points,
      progress,
      stroke: settings.lineColor,
      strokeWidth: settings.lineWidth,
      lineCap: 'round',
    }));
  }

  if (dot > 0) {
    children.push(group({
      x: ground.x,
      y: ground.y,
      scale: dot,
      children: [
        circle({ cx: 0, cy: 0, r: RING_RADIUS, stroke: settings.accentColor, strokeWidth: 1, opacity: 0.7 }),
        circle({ cx: 0, cy: 0, r: DOT_RADIUS, fill: settings.accentColor, stroke: settings.lineColor, strokeWidth: 1 }),
      ],
    }));
  }

  // One expanding, fading ring as the dot lands.
  if (burst > 0 && burst < 1) {
    children.push(circle({
      cx: ground.x,
      cy: ground.y,
      r: lerp(DOT_RADIUS, BURST_RADIUS, burst),
      stroke: settings.accentColor,
      strokeWidth: 1.5,
      opacity: 1 - burst,
    }));
  }

  if (settings.pulse && phase === 'visible') {
    const pulse = easeOutCubic((itemTime / PULSE_PERIOD) % 1);
    children.push(circle({
      cx: ground.x,
      cy: ground.y,
      r: lerp(RING_RADIUS, PULSE_RADIUS, pulse),
      stroke: settings.accentColor,
      strokeWidth: 1,
      opacity: 0.6 * (1 - pulse),
    }));
  }

  const textX = direction * SHELF_PAD;
  const textAlign = direction === 1 ? 'left' : 'right';
  const halo = settings.halo
    ? { stroke: HALO_COLOR, strokeWidth: HALO_TEXT_WIDTH }
    : {};

  if (title && titleReveal > 0) {
    // The title rises from behind the shelf: the clip ends at the line, so the
    // text is hidden until it has travelled above it.
    const clipTop = -(TITLE_SIZE + TITLE_GAP + HALO_TEXT_WIDTH);
    const travel = TITLE_SIZE + TITLE_GAP;
    children.push(group({
      clip: {
        x: Math.min(0, direction * shelfLength) - HALO_TEXT_WIDTH,
        y: clipTop,
        width: shelfLength + HALO_TEXT_WIDTH * 2,
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
              fontFamily: ANNOTATION_FONTS.condensed,
              fontWeight: TITLE_WEIGHT,
              letterSpacing: TITLE_SPACING,
              fill: settings.textColor,
              align: textAlign,
              baseline: 'alphabetic',
              ...halo,
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
      fontFamily: ANNOTATION_FONTS.condensed,
      fontWeight: SUBTITLE_WEIGHT,
      fill: settings.textColor,
      align: textAlign,
      baseline: 'top',
      opacity: subtitleReveal * SUBTITLE_OPACITY,
      ...halo,
    }));
  }

  return group({ children });
}

// ─── Measure ──────────────────────────────────────────────────────────────────

/**
 * Bounds of the finished state: ground dot, leader line, shelf and text, plus
 * the widest the pulse ring gets when it is on.
 */
export function measureLeaderLine(input: StyleRenderInput<LeaderLineSettings>): StyleBounds {
  const { ground, settings } = input;
  const finished = renderLeaderLine({ ...input, phase: 'visible', phaseProgress: 1 });
  const pulseExtent = settings.pulse
    ? [circle({ cx: ground.x, cy: ground.y, r: PULSE_RADIUS, stroke: settings.accentColor })]
    : [];
  const box = measureScene(group({ children: [finished, ...pulseExtent] }));
  return { x: box.minX, y: box.minY, width: box.width, height: box.height };
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export const leaderLineStyle: AnnotationStyleDefinition<LeaderLineSettings> = {
  id: 'leader-line',
  version: 1,
  name: 'Leader Line',
  description: 'Ground dot, a line drawn up to a shelf, and a title wiped on above it',
  category: 'label',
  icon: 'move-up-right',
  contentSlots: ['title', 'subtitle'],
  settingsSchema: leaderLineSettingsSchema,
  defaultSettings: defaultLeaderLineSettings,
  supportsAltitude: true,
  defaultAltitude: 0,
  defaultOffset: [70, -90],
  drawsConnector: true,
  defaultConnector: { visible: false },
  defaultTransition: {
    enter: 'auto',
    exit: 'auto',
    enterDuration: 1.2,
    exitDuration: 0.5,
  },
  controls: [
    { type: 'color', key: 'lineColor', label: 'Line color' },
    { type: 'color', key: 'accentColor', label: 'Dot color' },
    { type: 'color', key: 'textColor', label: 'Text color' },
    { type: 'switch', key: 'halo', label: 'Text halo' },
    {
      type: 'select',
      key: 'side',
      label: 'Side',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: 'left', label: 'Left' },
        { value: 'right', label: 'Right' },
      ],
    },
    { type: 'slider', key: 'lineWidth', label: 'Line width', min: 1, max: 4, step: 0.5, unit: 'px' },
    { type: 'switch', key: 'pulse', label: 'Pulse' },
  ],
  render: renderLeaderLine,
  measure: measureLeaderLine,
};

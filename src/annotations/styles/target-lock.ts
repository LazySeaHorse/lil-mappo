import { z } from 'zod';
import type { AnnotationStyleDefinition, SceneNode, ShadowConfig, StyleBounds, StyleRenderInput } from '../types';
import { ANNOTATION_FONTS } from '../fonts';
import {
  buildProgress,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  lerp,
  linear,
  stage,
} from '../motion';
import { caretVisible, scrambleText, typedCount } from '../scene/glyphs';
import { circle, group, polyline, rect, text } from '../scene/primitives';
import { measureTextWidth } from '../scene/textMetrics';
import { boundsOf, haloShadow, resolveDirection } from './shared';

// ─── Settings Schema ──────────────────────────────────────────────────────────

export const targetLockSettingsSchema = z.object({
  accentColor: z.string().default('#3DFFA8'),
  textColor: z.string().default('#E8FFF4'),
  halo: z.boolean().default(true),
  side: z.enum(['auto', 'left', 'right']).default('auto'),
  pulse: z.boolean().default(false),
});

export type TargetLockSettings = z.infer<typeof targetLockSettingsSchema>;

export const defaultTargetLockSettings: TargetLockSettings = {
  accentColor: '#3DFFA8',
  textColor: '#E8FFF4',
  halo: true,
  side: 'auto',
  pulse: false,
};

// ─── Layout Constants ─────────────────────────────────────────────────────────

/** Half the side of the bracket square (a 44px square). */
const HALF = 22;
const ARM = 11;
const BRACKET_WIDTH = 2;
const HAIRLINE = 1;
/** Brackets start this many times wider and snap in. */
const BRACKET_START_SCALE = 3;
const TICK_INNER = 3;
const TICK_OUTER = 9;

const EYEBROW_SIZE = 11;
const TITLE_SIZE = 16;
const SUBTITLE_SIZE = 12;
const MONO = ANNOTATION_FONTS.mono;
const PANEL_PAD = 9;
const PANEL_FILL = 'rgba(4, 12, 9, 0.55)';
const MIN_PANEL_WIDTH = 96;
/** Vertical positions of each readout line, from the top of the panel. */
const EYEBROW_TOP = PANEL_PAD;
const TITLE_TOP = EYEBROW_TOP + EYEBROW_SIZE + 6;
const SUBTITLE_TOP = TITLE_TOP + TITLE_SIZE + 6;
const CARET_WIDTH = 8;
const CARET_PERIOD = 0.5;
const SCRAMBLE_SEED = 7;
const PULSE_PERIOD = 2;
const PULSE_AMOUNT = 0.06;

/** Windows of the 0–1 build progress; they overlap so the readout follows the lock. */
const BRACKET_WINDOW = [0, 0.4] as const;
const TICK_WINDOW = [0.15, 0.45] as const;
const LINE_WINDOW = [0.3, 0.6] as const;
const PANEL_WINDOW = [0.45, 0.7] as const;
const COORDS_WINDOW = [0.5, 0.8] as const;
const TITLE_WINDOW = [0.6, 0.92] as const;
const SUBTITLE_WINDOW = [0.82, 1] as const;

// ─── Layout ───────────────────────────────────────────────────────────────────

interface Layout {
  direction: 1 | -1;
  eyebrow: string;
  title: string;
  subtitle: string;
  panelWidth: number;
  panelHeight: number;
}

function layout(input: StyleRenderInput<TargetLockSettings>): Layout {
  const { content, settings, ground } = input;
  const eyebrow = (content.eyebrow ?? '').trim();
  const title = (content.title ?? '').trim().toUpperCase();
  const subtitle = (content.subtitle ?? '').trim();

  const width = (value: string, size: number, weight: number, spacing?: string) =>
    value ? measureTextWidth(value, size, MONO, weight, spacing) : 0;
  const widest = Math.max(
    width(eyebrow, EYEBROW_SIZE, 500),
    // Room for the caret while the title is typing.
    title ? width(title, TITLE_SIZE, 700, '0.04em') + CARET_WIDTH : 0,
    width(subtitle, SUBTITLE_SIZE, 500),
  );
  const bottom = subtitle ? SUBTITLE_TOP + SUBTITLE_SIZE : title ? TITLE_TOP + TITLE_SIZE : EYEBROW_TOP + EYEBROW_SIZE;

  return {
    direction: resolveDirection(settings.side, ground.x),
    eyebrow,
    title,
    subtitle,
    panelWidth: Math.max(Math.ceil(widest) + PANEL_PAD * 2, MIN_PANEL_WIDTH),
    panelHeight: bottom + PANEL_PAD,
  };
}

/** The bracket corner facing the readout: where the connecting line leaves the lock. */
function lockCorner(ground: { x: number; y: number }, direction: 1 | -1): [number, number] {
  const towardX = ground.x === 0 ? direction : ground.x < 0 ? 1 : -1;
  const towardY = ground.y > 0 ? -1 : 1;
  return [ground.x + towardX * HALF, ground.y + towardY * HALF];
}

// ─── Render ───────────────────────────────────────────────────────────────────

/** Four corner brackets around (0, 0), each an L of two arms. */
function brackets(color: string, shadow: ShadowConfig | undefined, progress: number): SceneNode[] {
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) =>
    polyline({
      points: [[sx * HALF, sy * (HALF - ARM)], [sx * HALF, sy * HALF], [sx * (HALF - ARM), sy * HALF]],
      progress,
      stroke: color,
      strokeWidth: BRACKET_WIDTH,
      lineJoin: 'miter',
      lineCap: 'butt',
      shadow,
    }),
  );
}

export function renderTargetLock(input: StyleRenderInput<TargetLockSettings>): SceneNode {
  const { settings, ground, phase, phaseProgress, itemTime } = input;
  const { direction, eyebrow, title, subtitle, panelWidth, panelHeight } = layout(input);
  const { accentColor, textColor } = settings;
  const build = buildProgress(phase, phaseProgress);
  const shadow = haloShadow(settings.halo);

  const lock = stage(build, ...BRACKET_WINDOW, easeOutBack);
  const lockFade = stage(build, BRACKET_WINDOW[0], BRACKET_WINDOW[1] * 0.6, easeOutCubic);
  const ticks = stage(build, ...TICK_WINDOW, easeOutCubic);
  const leader = stage(build, ...LINE_WINDOW, easeInOutCubic);
  const panel = stage(build, ...PANEL_WINDOW, easeOutCubic);
  const coords = stage(build, ...COORDS_WINDOW, linear);
  const typing = stage(build, ...TITLE_WINDOW, linear);
  const subtitleReveal = stage(build, ...SUBTITLE_WINDOW, easeOutCubic);

  const children: SceneNode[] = [];

  // The lock itself, centred on the ground point.
  if (lockFade > 0) {
    const breathe = settings.pulse && phase === 'visible'
      ? PULSE_AMOUNT * (0.5 - 0.5 * Math.cos((itemTime / PULSE_PERIOD) * Math.PI * 2))
      : 0;
    children.push(group({
      x: ground.x,
      y: ground.y,
      scale: lerp(BRACKET_START_SCALE, 1, lock) + breathe,
      opacity: lockFade,
      children: brackets(accentColor, shadow, 1),
    }));
  }

  if (ticks > 0) {
    const inner = TICK_INNER;
    const outer = lerp(inner, TICK_OUTER, ticks);
    const arms: Array<Array<[number, number]>> = [
      [[ground.x - inner, ground.y], [ground.x - outer, ground.y]],
      [[ground.x + inner, ground.y], [ground.x + outer, ground.y]],
      [[ground.x, ground.y - inner], [ground.x, ground.y - outer]],
      [[ground.x, ground.y + inner], [ground.x, ground.y + outer]],
    ];
    for (const points of arms) {
      children.push(polyline({ points, stroke: accentColor, strokeWidth: HAIRLINE, shadow }));
    }
    children.push(circle({ cx: ground.x, cy: ground.y, r: 1.5, fill: accentColor, opacity: ticks, shadow }));
  }

  // Line from the bracket corner to the readout, ending in a rule across its top edge.
  if (leader > 0) {
    children.push(polyline({
      points: [lockCorner(ground, direction), [0, 0], [direction * panelWidth, 0]],
      progress: leader,
      stroke: accentColor,
      strokeWidth: HAIRLINE,
      lineCap: 'butt',
      shadow,
    }));
  }

  if (panel > 0) {
    children.push(rect({
      x: direction === 1 ? 0 : -panelWidth * panel,
      y: 0,
      width: panelWidth * panel,
      height: panelHeight,
      fill: PANEL_FILL,
    }));
  }

  const textX = (direction === 1 ? 0 : -panelWidth) + PANEL_PAD;
  const line = (top: number, size: number, weight: number, value: string, extra: Partial<Parameters<typeof text>[0]> = {}) =>
    text({
      x: textX,
      y: top,
      text: value,
      fontSize: size,
      fontFamily: MONO,
      fontWeight: weight,
      align: 'left',
      baseline: 'top',
      shadow,
      ...extra,
    });

  if (eyebrow && coords > 0) {
    children.push(line(EYEBROW_TOP, EYEBROW_SIZE, 500, scrambleText(eyebrow, coords, itemTime, { seed: SCRAMBLE_SEED }), {
      fill: accentColor,
      opacity: Math.min(1, coords * 4),
    }));
  }

  if (title && typing > 0) {
    const typed = typedCount(title.length, typing);
    const shown = title.slice(0, typed);
    if (shown) {
      children.push(line(TITLE_TOP, TITLE_SIZE, 700, shown, { fill: textColor, letterSpacing: '0.04em' }));
    }
    // The caret blinks while the title types, and is gone once it is complete.
    if (typing < 1 && caretVisible(itemTime, CARET_PERIOD)) {
      const caretX = textX + (shown ? measureTextWidth(shown, TITLE_SIZE, MONO, 700, '0.04em') : 0) + 1;
      children.push(rect({ x: caretX, y: TITLE_TOP + 1, width: 7, height: TITLE_SIZE - 1, fill: accentColor }));
    }
  }

  if (subtitle && subtitleReveal > 0) {
    children.push(line(SUBTITLE_TOP + (1 - subtitleReveal) * 5, SUBTITLE_SIZE, 500, subtitle, {
      fill: textColor,
      opacity: subtitleReveal * 0.8,
    }));
  }

  return group({ children });
}

// ─── Measure ──────────────────────────────────────────────────────────────────

/**
 * Bounds of the finished state, plus the lock at its widest (the brackets start
 * three times larger) and the breathing pulse, so neither is cropped.
 */
export function measureTargetLock(input: StyleRenderInput<TargetLockSettings>): StyleBounds {
  const { ground } = input;
  const finished = renderTargetLock({ ...input, phase: 'visible', phaseProgress: 1 });
  const reach = HALF * BRACKET_START_SCALE + BRACKET_WIDTH;
  const lockExtent = rect({ x: ground.x - reach, y: ground.y - reach, width: reach * 2, height: reach * 2 });
  return boundsOf(finished, lockExtent);
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export const targetLockStyle: AnnotationStyleDefinition<TargetLockSettings> = {
  id: 'target-lock',
  version: 1,
  name: 'Target Lock',
  description: 'Corner brackets snap onto the point, with a coordinate readout that scrambles and types in',
  category: 'data',
  icon: 'crosshair',
  contentSlots: ['eyebrow', 'title', 'subtitle'],
  settingsSchema: targetLockSettingsSchema,
  defaultSettings: defaultTargetLockSettings,
  supportsAltitude: true,
  defaultAltitude: 0,
  defaultOffset: [80, -80],
  drawsConnector: true,
  defaultConnector: { visible: false },
  defaultTransition: {
    enter: 'auto',
    exit: 'auto',
    enterDuration: 1.4,
    exitDuration: 0.6,
  },
  controls: [
    { type: 'color', key: 'accentColor', label: 'Accent color' },
    { type: 'color', key: 'textColor', label: 'Text color' },
    { type: 'switch', key: 'halo', label: 'Soft shadow' },
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
    { type: 'switch', key: 'pulse', label: 'Pulse' },
  ],
  render: renderTargetLock,
  measure: measureTargetLock,
};

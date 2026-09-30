import { z } from 'zod';
import type { AnnotationStyleDefinition, SceneNode, ShadowConfig, StyleBounds, StyleRenderInput } from '../types';
import { ANNOTATION_FONTS } from '../fonts';
import { buildProgress, easeInOutCubic, easeOutBack, easeOutCubic, stage } from '../motion';
import { hashInts, seededRandom } from '../random';
import { group, polyline, text } from '../scene/primitives';
import { roughArrow, roughCircle } from '../scene/rough';
import { pointAtLength, polylineLength, type Point } from '../scene/geometry';
import { measureTextWidth } from '../scene/textMetrics';
import { boundsOf, haloShadow, resolveDirection } from './shared';

// ─── Settings Schema ──────────────────────────────────────────────────────────

export const handDrawnSettingsSchema = z.object({
  strokeColor: z.string().default('#FF4136'),
  textColor: z.string().default('#FFFFFF'),
  circleSize: z.number().default(34),
  halo: z.boolean().default(true),
  side: z.enum(['auto', 'left', 'right']).default('auto'),
});

export type HandDrawnSettings = z.infer<typeof handDrawnSettingsSchema>;

export const defaultHandDrawnSettings: HandDrawnSettings = {
  strokeColor: '#FF4136',
  textColor: '#FFFFFF',
  circleSize: 34,
  halo: true,
  side: 'auto',
};

// ─── Layout Constants ─────────────────────────────────────────────────────────

const TITLE_SIZE = 26;
const TITLE_WEIGHT = 600;
const SUBTITLE_SIZE = 18;
const SUBTITLE_WEIGHT = 600;
const SUBTITLE_OPACITY = 0.9;
/** Baseline of the subtitle, below the title baseline. */
const SUBTITLE_BASELINE = 21;
/** Tilt of the writing, in degrees, mirrored for a label that extends left. */
const TEXT_TILT = -3;
const STROKE_WIDTH = 2.8;
const ARROW_HEAD = 15;
/** How far the arrow shaft bows sideways, as a share of its length. */
const ARROW_BOW = 0.16;
/** Gap between the arrow tip and the circle. */
const ARROW_GAP = 5;
/** Extra room around wiped text, so the shadow and swashes are not cropped. */
const WIPE_PAD = 10;

/**
 * Entrance timeline as windows of the 0–1 build progress: the circle is
 * scribbled, the arrow is pulled from the label towards it, then the words are
 * written. The exit plays the same timeline backwards.
 */
const CIRCLE_WINDOW = [0, 0.4] as const;
const SECOND_PASS_WINDOW = [0.18, 0.5] as const;
const SHAFT_WINDOW = [0.32, 0.6] as const;
const HEAD_WINDOW = [0.56, 0.7] as const;
const TITLE_WINDOW = [0.6, 0.92] as const;
const SUBTITLE_WINDOW = [0.78, 1] as const;

// ─── Layout ───────────────────────────────────────────────────────────────────

/** Stable per-callout seed, so each callout is drawn a little differently but always the same way. */
export function seedFor(title: string): number {
  return hashInts(...Array.from(title, (char) => char.charCodeAt(0)), title.length) % 100000;
}

interface Drawing {
  circle: Point[];
  secondPass: Point[];
  shaft: Point[];
  head: Point[];
}

/** The scribbled circle and the arrow, in the style's coordinates. */
function drawMarks(input: StyleRenderInput<HandDrawnSettings>, direction: 1 | -1, seed: number, hasSubtitle: boolean): Drawing {
  const { ground, settings } = input;
  const r = settings.circleSize;
  const circle = roughCircle(ground.x, ground.y, r, { seed, overshoot: 0.14 });
  const secondPass = roughCircle(ground.x, ground.y, r * 0.96, { seed: seed + 7, overshoot: 0.05, startAngle: 0.5 });

  // The arrow leaves from just under the start of the writing and lands short of the circle.
  const from: Point = [direction * 6, (hasSubtitle ? SUBTITLE_BASELINE : 0) + 12];
  const dx = ground.x - from[0];
  const dy = ground.y - from[1];
  const distance = Math.hypot(dx, dy) || 1;
  const ux = dx / distance;
  const uy = dy / distance;
  const stop = Math.min(r * 1.16 + ARROW_GAP, Math.max(distance - 12, 0));
  const to: Point = [ground.x - ux * stop, ground.y - uy * stop];

  const { shaft: straight } = roughArrow(from, to, { seed: seed + 3, roughness: 0.8 });
  const rng = seededRandom(seed + 11);
  // Bow the shaft to one side, as a flick of the wrist would.
  const bow = (rng() < 0.5 ? -1 : 1) * ARROW_BOW * Math.hypot(to[0] - from[0], to[1] - from[1]);
  const nx = -uy;
  const ny = ux;
  // Resampled finely so the bow is a smooth curve rather than a few straight kinks.
  const total = polylineLength(straight);
  const shaft = Array.from({ length: 17 }, (_, i) => {
    const t = i / 16;
    const [x, y] = pointAtLength(straight, total * t);
    const push = Math.sin(t * Math.PI) * bow;
    return [x + nx * push, y + ny * push] as Point;
  });

  // The head follows the direction the shaft is travelling as it lands.
  const tip = shaft[shaft.length - 1];
  const back = shaft[Math.max(0, shaft.length - 2)];
  const heading = Math.atan2(tip[1] - back[1], tip[0] - back[0]);
  const wing = (side: number): Point => {
    const angle = heading + Math.PI + side * (Math.PI / 6.5 + (rng() - 0.5) * 0.14);
    const length = ARROW_HEAD * (1 + (rng() - 0.5) * 0.24);
    return [tip[0] + Math.cos(angle) * length, tip[1] + Math.sin(angle) * length];
  };
  return { circle, secondPass, shaft, head: [wing(1), [tip[0], tip[1]], wing(-1)] };
}

interface Layout {
  direction: 1 | -1;
  seed: number;
  title: string;
  subtitle: string;
  titleWidth: number;
  subtitleWidth: number;
}

function layout(input: StyleRenderInput<HandDrawnSettings>): Layout {
  const { content, settings, ground } = input;
  const title = (content.title ?? '').trim();
  const subtitle = (content.subtitle ?? '').trim();
  return {
    direction: resolveDirection(settings.side, ground.x),
    seed: seedFor(title),
    title,
    subtitle,
    titleWidth: title ? measureTextWidth(title, TITLE_SIZE, ANNOTATION_FONTS.handwritten, TITLE_WEIGHT) : 0,
    subtitleWidth: subtitle ? measureTextWidth(subtitle, SUBTITLE_SIZE, ANNOTATION_FONTS.handwritten, SUBTITLE_WEIGHT) : 0,
  };
}

// ─── Render ───────────────────────────────────────────────────────────────────

export function renderHandDrawn(input: StyleRenderInput<HandDrawnSettings>): SceneNode {
  const { settings, phase, phaseProgress } = input;
  const { direction, seed, title, subtitle, titleWidth, subtitleWidth } = layout(input);
  const build = buildProgress(phase, phaseProgress);
  const shadow = haloShadow(settings.halo);
  const marks = drawMarks(input, direction, seed, subtitle !== '');

  const circleDraw = stage(build, ...CIRCLE_WINDOW, easeInOutCubic);
  const secondDraw = stage(build, ...SECOND_PASS_WINDOW, easeInOutCubic);
  const shaftDraw = stage(build, ...SHAFT_WINDOW, easeOutCubic);
  const headDraw = stage(build, ...HEAD_WINDOW, easeOutBack);
  const titleWipe = stage(build, ...TITLE_WINDOW, easeInOutCubic);
  const subtitleWipe = stage(build, ...SUBTITLE_WINDOW, easeInOutCubic);

  const marker = (points: Point[], progress: number, opacity = 1) =>
    polyline({
      points: points as Array<[number, number]>,
      progress,
      stroke: settings.strokeColor,
      strokeWidth: STROKE_WIDTH,
      lineCap: 'round',
      lineJoin: 'round',
      opacity,
      shadow,
    });

  const children: SceneNode[] = [];
  if (circleDraw > 0) children.push(marker(marks.circle, circleDraw));
  if (secondDraw > 0) children.push(marker(marks.secondPass, Math.min(secondDraw, 1) * 0.55, 0.85));
  if (shaftDraw > 0) children.push(marker(marks.shaft, shaftDraw));
  if (headDraw > 0) children.push(marker(marks.head, Math.min(headDraw, 1)));

  // The words are written left to right: a clip edge sweeps across each line.
  const tilt = (TEXT_TILT * direction * Math.PI) / 180;
  const left = direction === 1 ? 0 : -1;
  const writing = (
    value: string,
    width: number,
    wipe: number,
    props: { y: number; size: number; weight: number; opacity?: number },
  ): SceneNode => {
    const x = left * width;
    return group({
      clip: {
        x: x - WIPE_PAD,
        y: props.y - props.size * 1.3 - WIPE_PAD,
        width: (width + WIPE_PAD * 2) * wipe,
        height: props.size * 1.9 + WIPE_PAD * 2,
      },
      children: [
        text({
          x,
          y: props.y,
          text: value,
          fontSize: props.size,
          fontFamily: ANNOTATION_FONTS.handwritten,
          fontWeight: props.weight,
          fill: settings.textColor,
          align: 'left',
          baseline: 'alphabetic',
          opacity: props.opacity,
          shadow,
        }),
      ],
    });
  };

  const lines: SceneNode[] = [];
  if (title && titleWipe > 0) {
    lines.push(writing(title, titleWidth, titleWipe, { y: 0, size: TITLE_SIZE, weight: TITLE_WEIGHT }));
  }
  if (subtitle && subtitleWipe > 0) {
    lines.push(writing(subtitle, subtitleWidth, subtitleWipe, {
      y: SUBTITLE_BASELINE,
      size: SUBTITLE_SIZE,
      weight: SUBTITLE_WEIGHT,
      opacity: SUBTITLE_OPACITY,
    }));
  }
  if (lines.length > 0) children.push(group({ rotation: tilt, children: lines }));

  return group({ children });
}

// ─── Measure ──────────────────────────────────────────────────────────────────

/** Bounds of the finished drawing: circle, arrow and writing. */
export function measureHandDrawn(input: StyleRenderInput<HandDrawnSettings>): StyleBounds {
  return boundsOf(renderHandDrawn({ ...input, phase: 'visible', phaseProgress: 1 }));
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export const handDrawnStyle: AnnotationStyleDefinition<HandDrawnSettings> = {
  id: 'hand-drawn',
  version: 1,
  name: 'Hand-drawn',
  description: 'A marker circle scribbled round the point, an arrow to it, and a handwritten note',
  category: 'editorial',
  icon: 'pen-line',
  contentSlots: ['title', 'subtitle'],
  settingsSchema: handDrawnSettingsSchema,
  defaultSettings: defaultHandDrawnSettings,
  supportsAltitude: true,
  defaultAltitude: 0,
  defaultOffset: [80, -100],
  drawsConnector: true,
  defaultConnector: { visible: false },
  defaultTransition: {
    enter: 'auto',
    exit: 'auto',
    enterDuration: 1.6,
    exitDuration: 0.5,
  },
  controls: [
    { type: 'color', key: 'strokeColor', label: 'Marker color' },
    { type: 'color', key: 'textColor', label: 'Text color' },
    { type: 'slider', key: 'circleSize', label: 'Circle size', min: 20, max: 80, step: 2, unit: 'px' },
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
  ],
  render: renderHandDrawn,
  measure: measureHandDrawn,
};

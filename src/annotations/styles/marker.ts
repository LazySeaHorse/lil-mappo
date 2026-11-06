import { z } from 'zod';
import type { AnnotationStyleDefinition, SceneNode, StyleBounds, StyleRenderInput } from '../types';
import { ANNOTATION_FONTS } from '../fonts';
import { buildProgress, easeOutBack, stage } from '../motion';
import { circle, group, path, polyline, rect, text } from '../scene/primitives';
import { measureTextWidth } from '../scene/textMetrics';
import { CONTENT_WINDOW, droppingPin, groundShadow, PIN_SHADOW, pinDrop, pinDropBounds, pinPath } from './pinDrop';
import { boundsOf, HALO_CONTROL, haloSchema } from './shared';

// ─── Settings Schema ──────────────────────────────────────────────────────────

const HEADS = ['circle', 'square'] as const;
const TAILS = ['pointer', 'stick'] as const;
const SUBTITLE_POSITIONS = ['above', 'below'] as const;

export const markerSettingsSchema = z.object({
  markerColor: z.string().default('#FFFFFF'),
  titleColor: z.string().default('#1F2937'),
  subtitleColor: z.string().default('#EF4444'),
  head: z.enum(HEADS).default('circle'),
  tail: z.enum(TAILS).default('pointer'),
  subtitlePosition: z.enum(SUBTITLE_POSITIONS).default('above'),
  /** Turns the text 45° up to the right. */
  tilt: z.boolean().default(false),
  halo: haloSchema,
  /** Size of the head in pixels. */
  size: z.number().default(72),
});

export type MarkerSettings = z.infer<typeof markerSettingsSchema>;

export const defaultMarkerSettings: MarkerSettings = markerSettingsSchema.parse({});

// ─── Layout Constants ─────────────────────────────────────────────────────────

const FONT = ANNOTATION_FONTS.body;
const TITLE_WEIGHT = 800;
const SUBTITLE_WEIGHT = 600;

/** How far below the head's centre a round head's tip sits, as a share of its radius (as Photo Pin). */
const CIRCLE_TIP_DEPTH = 1.75;
/** A square head is a little smaller than the circle of the same size, so the two weigh the same. */
const SQUARE_SHARE = 0.9;
const SQUARE_CORNER = 0.3;
/** The square head's pointer, as shares of its half-width: length below the head and half its base. */
const ARROW_LENGTH = 0.6;
const ARROW_HALF_BASE = 0.4;
/** Length of the stick under the head, as a share of the head's half-width. */
const STICK_LENGTH = 1.1;
const STICK_WIDTH = 3;

/** Text sizes as shares of the head's half-width: a title with a subtitle, a lone title, the subtitle. */
const TITLE_WITH_SUBTITLE = 0.72;
const TITLE_ALONE = 0.85;
const SUBTITLE_SIZE = 0.4;
/** Widest a line may be, as a share of the head's half-width; longer ones shrink to fit. */
const ROUND_TEXT_WIDTH = 1.45;
const SQUARE_TEXT_WIDTH = 1.7;
const LINE_GAP = 0.06;

// ─── Layout ───────────────────────────────────────────────────────────────────

interface Line {
  text: string;
  fontSize: number;
  fontWeight: number;
  fill: string;
}

interface Layout {
  /** Half the head's width (and height). */
  half: number;
  /** Centre of the head, above the tip at the origin. */
  headY: number;
  lines: Line[];
}

function fitted(content: string, base: number, weight: number, maxWidth: number): number {
  const width = measureTextWidth(content, base, FONT, weight);
  return width > maxWidth ? base * (maxWidth / width) : base;
}

function layout(input: StyleRenderInput<MarkerSettings>): Layout {
  const { content, settings } = input;
  const radius = Math.max(16, settings.size / 2);
  const square = settings.head === 'square';
  const half = square ? radius * SQUARE_SHARE : radius;
  const below = settings.tail === 'stick' ? half * STICK_LENGTH : half * (square ? ARROW_LENGTH : CIRCLE_TIP_DEPTH - 1);
  const maxWidth = half * (square ? SQUARE_TEXT_WIDTH : ROUND_TEXT_WIDTH);

  const title = (content.title ?? '').trim();
  const subtitle = (content.subtitle ?? '').trim();
  const lines: Line[] = [];
  if (title) {
    const base = half * (subtitle ? TITLE_WITH_SUBTITLE : TITLE_ALONE);
    lines.push({ text: title, fontSize: fitted(title, base, TITLE_WEIGHT, maxWidth), fontWeight: TITLE_WEIGHT, fill: settings.titleColor });
  }
  if (subtitle) {
    const base = half * SUBTITLE_SIZE;
    const line = { text: subtitle, fontSize: fitted(subtitle, base, SUBTITLE_WEIGHT, maxWidth), fontWeight: SUBTITLE_WEIGHT, fill: settings.subtitleColor };
    if (settings.subtitlePosition === 'above') lines.unshift(line);
    else lines.push(line);
  }
  return { half, headY: -(half + below), lines };
}

/**
 * A rounded square head of half-width `half` centred at (0, headY), with a
 * pointer from its bottom edge down to the tip at the origin, as one path.
 */
export function squarePinPath(half: number, headY: number): string {
  const c = half * SQUARE_CORNER;
  const top = headY - half;
  const bottom = headY + half;
  const base = half * ARROW_HALF_BASE;
  const f = (n: number) => n.toFixed(2);
  const arc = (x: number, y: number) => `A${f(c)} ${f(c)} 0 0 0 ${f(x)} ${f(y)}`;
  return [
    'M0 0',
    `L${f(base)} ${f(bottom)}`,
    `L${f(half - c)} ${f(bottom)}`, arc(half, bottom - c),
    `L${f(half)} ${f(top + c)}`, arc(half - c, top),
    `L${f(-half + c)} ${f(top)}`, arc(-half, top + c),
    `L${f(-half)} ${f(bottom - c)}`, arc(-half + c, bottom),
    `L${f(-base)} ${f(bottom)}`,
    'Z',
  ].join('');
}

// ─── Render ───────────────────────────────────────────────────────────────────

/** The head, and the pointer when there is one, in the marker's colour. */
function body(l: Layout, settings: MarkerSettings): SceneNode[] {
  const fill = settings.markerColor;
  const shadow = settings.halo ? PIN_SHADOW : undefined;
  const square = settings.head === 'square';
  const nodes: SceneNode[] = [];

  if (settings.tail === 'stick') {
    nodes.push(polyline({
      points: [[0, l.headY], [0, 0]],
      stroke: fill,
      strokeWidth: STICK_WIDTH,
      lineCap: 'round',
      shadow,
    }));
    nodes.push(square
      ? rect({ x: -l.half, y: l.headY - l.half, width: l.half * 2, height: l.half * 2, cornerRadius: l.half * SQUARE_CORNER, fill, shadow })
      : circle({ cx: 0, cy: l.headY, r: l.half, fill, shadow }));
  } else {
    nodes.push(path({ d: square ? squarePinPath(l.half, l.headY) : pinPath(l.half, l.headY), fill, shadow }));
  }
  return nodes;
}

/** The lines of text stacked about the head's centre. */
function label(l: Layout): SceneNode[] {
  const gap = l.half * LINE_GAP;
  const height = l.lines.reduce((sum, line) => sum + line.fontSize, 0) + gap * (l.lines.length - 1);
  let top = l.headY - height / 2;
  return l.lines.map((line) => {
    const node = text({
      x: 0,
      y: top + line.fontSize / 2,
      text: line.text,
      fontSize: line.fontSize,
      fontFamily: FONT,
      fontWeight: line.fontWeight,
      fill: line.fill,
      align: 'center',
      baseline: 'middle',
    });
    top += line.fontSize + gap;
    return node;
  });
}

export function renderMarker(input: StyleRenderInput<MarkerSettings>): SceneNode {
  const { settings, phase, phaseProgress } = input;
  const l = layout(input);
  const build = buildProgress(phase, phaseProgress);

  const drop = pinDrop(build);
  const pop = stage(build, ...CONTENT_WINDOW, (t) => easeOutBack(t, 1.4));

  const pin = body(l, settings);
  if (pop > 0 && l.lines.length > 0) {
    pin.push(group({
      scale: pop,
      anchorX: 0,
      anchorY: l.headY,
      children: [group({
        rotation: settings.tilt ? -Math.PI / 4 : 0,
        anchorX: 0,
        anchorY: l.headY,
        children: label(l),
      })],
    }));
  }

  return group({ children: [...groundShadow(drop), ...droppingPin(drop, pin)] });
}

// ─── Measure ──────────────────────────────────────────────────────────────────

/** Bounds of the finished state, with room for the fall, the squash and the pin's shadow. */
export function measureMarker(input: StyleRenderInput<MarkerSettings>): StyleBounds {
  const l = layout(input);
  const finished = renderMarker({ ...input, phase: 'visible', phaseProgress: 1 });
  return boundsOf(finished, rect(pinDropBounds(l.half, l.headY - l.half)));
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export const markerStyle: AnnotationStyleDefinition<MarkerSettings> = {
  id: 'marker',
  version: 1,
  name: 'Marker',
  description: 'A pin that drops onto the point, round or square, on a pointer or a stick, with a number inside',
  category: 'marker',
  icon: 'pin',
  contentSlots: ['title', 'subtitle'],
  settingsSchema: markerSettingsSchema,
  defaultSettings: defaultMarkerSettings,
  supportsAltitude: false,
  defaultAltitude: 0,
  defaultOffset: [0, 0],
  defaultAnchor: 'bottom',
  drawsConnector: false,
  defaultConnector: { visible: false },
  defaultTransition: {
    enter: 'auto',
    exit: 'auto',
    enterDuration: 1.2,
    exitDuration: 0.5,
  },
  controls: [
    { type: 'color', key: 'markerColor', label: 'Marker color', role: 'accent' },
    { type: 'color', key: 'titleColor', label: 'Title color' },
    { type: 'color', key: 'subtitleColor', label: 'Subtitle color' },
    {
      type: 'tabs',
      key: 'head',
      label: 'Head',
      options: [{ value: 'circle', label: 'Round' }, { value: 'square', label: 'Square' }],
    },
    {
      type: 'tabs',
      key: 'tail',
      label: 'Tail',
      options: [{ value: 'pointer', label: 'Pointer' }, { value: 'stick', label: 'Stick' }],
    },
    {
      type: 'tabs',
      key: 'subtitlePosition',
      label: 'Subtitle',
      options: [{ value: 'above', label: 'Above' }, { value: 'below', label: 'Below' }],
    },
    { type: 'switch', key: 'tilt', label: 'Tilt text' },
    HALO_CONTROL,
    { type: 'slider', key: 'size', label: 'Size', min: 48, max: 160, step: 4, unit: 'px' },
  ],
  render: renderMarker,
  measure: measureMarker,
};

import { z } from 'zod';
import type { AnnotationStyleDefinition, SceneNode, Shadow, ShadowConfig, StyleBounds, StyleRenderInput } from '../types';
import { ANNOTATION_FONTS } from '../fonts';
import { buildProgress, clamp01, easeInCubic, easeOutBack, easeOutCubic, easeOutQuad, lerp, stage } from '../motion';
import { hashInts, seededRandom } from '../random';
import { polylineLength, trimPolyline, type Point } from '../scene/geometry';
import { arcGlyphGroups, layoutGlyphs, layoutGlyphsOnArc } from '../scene/glyphs';
import { circle, group, path, polyline, rect, text } from '../scene/primitives';
import { roughRect } from '../scene/rough';
import { measureTextWidth } from '../scene/textMetrics';
import { boundsOf } from './shared';

// ─── Settings Schema ──────────────────────────────────────────────────────────

export const stampSettingsSchema = z.object({
  inkColor: z.string().default('#D7263D'),
  shape: z.enum(['round', 'rect']).default('round'),
  /** Degrees, clockwise. */
  rotation: z.number().default(-8),
  splash: z.boolean().default(true),
  halo: z.boolean().default(true),
});

export type StampSettings = z.infer<typeof stampSettingsSchema>;

export const defaultStampSettings: StampSettings = {
  inkColor: '#D7263D',
  shape: 'round',
  rotation: -8,
  splash: true,
  halo: true,
};

// ─── Layout Constants ─────────────────────────────────────────────────────────

const INK_OPACITY = 0.9;
const FONT = ANNOTATION_FONTS.condensed;
const WEIGHT = 700;
const TRACKING = '0.12em';

// Round stamp
const ROUND_MIN_RADIUS = 66;
const ARC_TITLE_SIZE = 20;
const ARC_TITLE_MIN_SIZE = 14;
/** Widest arc the title may span, radians; the sides stay free for the dots. */
const ARC_MAX_SPAN = (150 * Math.PI) / 180;
const ROUND_SUBTITLE_SIZE = 15;
const OUTER_RING_WIDTH = 3.2;
const INNER_RING_WIDTH = 1.6;
/** Cap height as a share of the font size (Barlow Condensed). */
const CAP_HEIGHT = 0.7;

// Rect stamp
const RECT_TITLE_SIZE = 34;
const RECT_SUBTITLE_SIZE = 15;
const RECT_PAD_X = 20;
const RECT_PAD_Y = 13;
const RECT_MIN_WIDTH = 120;
const RECT_TITLE_GAP = 9;
const RECT_INNER_INSET = 5.5;

/** Faint dark shadow that keeps the red ink readable on any map. */
const INK_SHADOW: ShadowConfig = { color: 'rgba(0, 0, 0, 0.35)', blur: 5, offsetX: 0, offsetY: 0 };

// Impact
const FALL_START_SCALE = 1.8;
const IMPACT_SCALE = 0.94;
const SHAKE_AMPLITUDE = 0.05;
const SPLASH_GROWTH = 0.3;
const EXIT_GROWTH = 0.05;

/**
 * Entrance timeline as windows of the 0–1 build progress. The stamp falls and
 * fades in until it lands at the halfway mark, then settles with a small
 * overshoot and a shudder while the splash ring spreads. The exit is not this
 * played backwards: the stamp simply fades away, see `renderStamp`.
 */
const FADE_IN_WINDOW = [0, 0.35] as const;
const FALL_WINDOW = [0, 0.5] as const;
const SETTLE_WINDOW = [0.5, 0.8] as const;
const SHUDDER_WINDOW = [0.5, 1] as const;
const SPLASH_WINDOW = [0.5, 1] as const;

// ─── Ink gaps ─────────────────────────────────────────────────────────────────

/**
 * Where a stroke of `length` pixels has ink, as [from, to] fractions of it, once
 * a few small seeded gaps are worn out of it: the stamp's ink texture.
 */
export function inkSpans(length: number, seed: number, gaps = 3): Array<[number, number]> {
  const rng = seededRandom(seed);
  const cuts = Array.from({ length: gaps }, (_, i) => {
    const centre = (i + 0.2 + rng() * 0.6) / gaps;
    const half = (1.2 + rng() * 1.8) / length;
    return [centre - half, centre + half] as [number, number];
  });
  const spans: Array<[number, number]> = [];
  let from = 0;
  for (const [start, end] of cuts) {
    spans.push([from, start]);
    from = end;
  }
  spans.push([from, 1]);
  return spans;
}

// ─── Layout ───────────────────────────────────────────────────────────────────

interface RoundLayout {
  kind: 'round';
  title: string;
  subtitle: string;
  radius: number;
  innerRadius: number;
  textRadius: number;
  titleSize: number;
}

interface RectLayout {
  kind: 'rect';
  title: string;
  subtitle: string;
  width: number;
  height: number;
  titleBaseline: number;
  subtitleBaseline: number;
}

type Layout = RoundLayout | RectLayout;

const titleWidth = (value: string, size: number) => measureTextWidth(value, size, FONT, WEIGHT, TRACKING);

function layoutRound(title: string, subtitle: string): RoundLayout {
  // Shrink the title first if it would span too much of the ring, then grow the ring.
  let titleSize = ARC_TITLE_SIZE;
  while (titleSize > ARC_TITLE_MIN_SIZE && title && titleWidth(title, titleSize) / ARC_MAX_SPAN > 44) titleSize -= 1;
  const bandDepth = titleSize * CAP_HEIGHT;
  const textRadiusFor = (radius: number) => radius - 5 - bandDepth / 2;
  const innerRadiusFor = (radius: number) => radius - 5 - bandDepth - 6;

  let radius = ROUND_MIN_RADIUS;
  if (title) radius = Math.max(radius, titleWidth(title, titleSize) / ARC_MAX_SPAN + 5 + bandDepth / 2);
  if (subtitle) {
    const subtitleWidth = measureTextWidth(subtitle, ROUND_SUBTITLE_SIZE, FONT, WEIGHT, '0.06em');
    radius = Math.max(radius, subtitleWidth / 1.6 + 5 + bandDepth + 6);
  }
  radius = Math.ceil(radius);
  return {
    kind: 'round',
    title,
    subtitle,
    radius,
    innerRadius: innerRadiusFor(radius),
    textRadius: textRadiusFor(radius),
    titleSize,
  };
}

function layoutRect(title: string, subtitle: string): RectLayout {
  const cap = RECT_TITLE_SIZE * CAP_HEIGHT;
  const subCap = RECT_SUBTITLE_SIZE * CAP_HEIGHT;
  const contentHeight = (title ? cap : 0) + (subtitle ? (title ? RECT_TITLE_GAP : 0) + subCap : 0);
  const contentWidth = Math.max(
    title ? titleWidth(title, RECT_TITLE_SIZE) : 0,
    subtitle ? measureTextWidth(subtitle, RECT_SUBTITLE_SIZE, FONT, WEIGHT, '0.08em') : 0,
  );
  const top = -contentHeight / 2;
  return {
    kind: 'rect',
    title,
    subtitle,
    width: Math.max(Math.ceil(contentWidth) + RECT_PAD_X * 2, RECT_MIN_WIDTH),
    height: Math.max(contentHeight + RECT_PAD_Y * 2, 50),
    titleBaseline: top + cap,
    subtitleBaseline: top + (title ? cap + RECT_TITLE_GAP : 0) + subCap,
  };
}

function layout(input: StyleRenderInput<StampSettings>): Layout {
  const title = (input.content.title ?? '').trim().toUpperCase();
  const subtitle = (input.content.subtitle ?? '').trim().toUpperCase();
  return input.settings.shape === 'rect' ? layoutRect(title, subtitle) : layoutRound(title, subtitle);
}

// ─── Drawing the stamp ────────────────────────────────────────────────────────

function star(cx: number, cy: number, r: number, fill: string, shadow?: Shadow): SceneNode {
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? r : r * 0.42;
    return `${(cx + Math.cos(angle) * radius).toFixed(2)} ${(cy + Math.sin(angle) * radius).toFixed(2)}`;
  });
  return path({ d: `M${points.join('L')}Z`, fill, shadow });
}

/** A ring split into inked arcs by the seeded gaps. */
function wornRing(radius: number, width: number, ink: string, seed: number, shadow?: Shadow): SceneNode[] {
  const circumference = Math.PI * 2 * radius;
  return inkSpans(circumference, seed).map(([from, to]) =>
    circle({ cx: 0, cy: 0, r: radius, stroke: ink, strokeWidth: width, startAngle: from * Math.PI * 2, endAngle: to * Math.PI * 2, shadow }),
  );
}

/** A rough outline split into inked strokes by the seeded gaps. */
function wornOutline(points: Point[], width: number, ink: string, seed: number, shadow?: Shadow): SceneNode[] {
  return inkSpans(polylineLength(points), seed).flatMap(([from, to]) => {
    const piece = trimPolyline(points, from, to);
    return piece.length > 1
      ? [polyline({ points: piece as Array<[number, number]>, stroke: ink, strokeWidth: width, lineCap: 'butt', lineJoin: 'round', shadow })]
      : [];
  });
}

function drawRound(l: RoundLayout, ink: string, seed: number, shadow?: Shadow): SceneNode[] {
  const nodes: SceneNode[] = [
    ...wornRing(l.radius, OUTER_RING_WIDTH, ink, seed, shadow),
    ...wornRing(l.innerRadius, INNER_RING_WIDTH, ink, seed + 1, shadow),
  ];

  if (l.title) {
    const spec = { fontSize: l.titleSize, fontFamily: FONT, fontWeight: WEIGHT, letterSpacing: TRACKING };
    const glyphs = layoutGlyphsOnArc(layoutGlyphs(l.title, spec), { radius: l.textRadius, centerAngle: -Math.PI / 2 });
    nodes.push(...arcGlyphGroups(glyphs, { ...spec, fill: ink, shadow }));
  }

  // Dots at the sides and a star at the foot of the text band.
  for (const angle of [0, Math.PI]) {
    nodes.push(circle({ cx: Math.cos(angle) * l.textRadius, cy: Math.sin(angle) * l.textRadius, r: 2.4, fill: ink, shadow }));
  }
  nodes.push(star(0, l.textRadius, 5.5, ink, shadow));

  if (l.subtitle) {
    const rule = l.innerRadius * 0.62;
    const offset = ROUND_SUBTITLE_SIZE * 0.72;
    for (const y of [-offset, offset]) {
      nodes.push(polyline({ points: [[-rule, y], [rule, y]], stroke: ink, strokeWidth: 1.2, shadow }));
    }
    nodes.push(text({
      x: 0,
      y: 0,
      text: l.subtitle,
      fontSize: ROUND_SUBTITLE_SIZE,
      fontFamily: FONT,
      fontWeight: WEIGHT,
      letterSpacing: '0.06em',
      fill: ink,
      align: 'center',
      baseline: 'middle',
      shadow,
    }));
  } else {
    nodes.push(star(0, 0, l.innerRadius * 0.4, ink, shadow));
  }
  return nodes;
}

function drawRect(l: RectLayout, ink: string, seed: number, shadow?: Shadow): SceneNode[] {
  const x = -l.width / 2;
  const y = -l.height / 2;
  const nodes: SceneNode[] = [
    ...wornOutline(roughRect(x, y, l.width, l.height, { seed, roughness: 0.5 }), 3.5, ink, seed + 1, shadow),
    ...wornOutline(
      roughRect(x + RECT_INNER_INSET, y + RECT_INNER_INSET, l.width - RECT_INNER_INSET * 2, l.height - RECT_INNER_INSET * 2, { seed: seed + 2, roughness: 0.4 }),
      1.6,
      ink,
      seed + 3,
      shadow,
    ),
  ];
  if (l.title) {
    nodes.push(text({
      x: 0,
      y: l.titleBaseline,
      text: l.title,
      fontSize: RECT_TITLE_SIZE,
      fontFamily: FONT,
      fontWeight: WEIGHT,
      letterSpacing: TRACKING,
      fill: ink,
      align: 'center',
      baseline: 'alphabetic',
      shadow,
    }));
  }
  if (l.subtitle) {
    nodes.push(text({
      x: 0,
      y: l.subtitleBaseline,
      text: l.subtitle,
      fontSize: RECT_SUBTITLE_SIZE,
      fontFamily: FONT,
      fontWeight: WEIGHT,
      letterSpacing: '0.08em',
      fill: ink,
      align: 'center',
      baseline: 'alphabetic',
      shadow,
    }));
  }
  return nodes;
}

/** The outline the impact ring expands, drawn plain. */
function splashOutline(l: Layout, ink: string): SceneNode {
  return l.kind === 'round'
    ? circle({ cx: 0, cy: 0, r: l.radius, stroke: ink, strokeWidth: 2.5 })
    : rect({ x: -l.width / 2, y: -l.height / 2, width: l.width, height: l.height, cornerRadius: 3, stroke: ink, strokeWidth: 2.5 });
}

// ─── Render ───────────────────────────────────────────────────────────────────

export function renderStamp(input: StyleRenderInput<StampSettings>): SceneNode {
  const { settings, phase, phaseProgress } = input;
  const l = layout(input);
  const seed = hashInts(...Array.from(l.title + l.subtitle, (char) => char.charCodeAt(0))) % 100000;
  const shadow = settings.halo ? INK_SHADOW : undefined;
  const baseRotation = (settings.rotation * Math.PI) / 180;

  let opacity: number;
  let scale: number;
  let rotation = baseRotation;
  let splash = 0;

  if (phase === 'exit') {
    // Leaves by fading away and lifting a touch, not by un-slamming.
    const gone = easeOutQuad(clamp01(phaseProgress));
    opacity = 1 - gone;
    scale = 1 + EXIT_GROWTH * gone;
  } else {
    const build = buildProgress(phase, phaseProgress);
    opacity = stage(build, ...FADE_IN_WINDOW, easeOutCubic);
    const fall = stage(build, ...FALL_WINDOW, easeInCubic);
    const settle = stage(build, ...SETTLE_WINDOW, easeOutBack);
    scale = build < FALL_WINDOW[1] ? lerp(FALL_START_SCALE, IMPACT_SCALE, fall) : lerp(IMPACT_SCALE, 1, settle);
    const shudder = stage(build, ...SHUDDER_WINDOW);
    if (shudder < 1) rotation += Math.sin(shudder * Math.PI * 4) * (1 - shudder) * SHAKE_AMPLITUDE;
    splash = stage(build, ...SPLASH_WINDOW, easeOutCubic);
  }

  if (opacity <= 0) return group({ children: [] });

  const body = l.kind === 'round' ? drawRound(l, settings.inkColor, seed, shadow) : drawRect(l, settings.inkColor, seed, shadow);
  const children: SceneNode[] = [];
  if (settings.splash && splash > 0 && splash < 1) {
    children.push(group({
      rotation: baseRotation,
      scale: 1 + SPLASH_GROWTH * splash,
      opacity: 0.45 * (1 - splash),
      children: [splashOutline(l, settings.inkColor)],
    }));
  }
  children.push(group({ rotation, scale, opacity: opacity * INK_OPACITY, children: body }));
  return group({ children });
}

// ─── Measure ──────────────────────────────────────────────────────────────────

/** Bounds of the finished stamp, including the widest the shudder and splash reach. */
export function measureStamp(input: StyleRenderInput<StampSettings>): StyleBounds {
  const finished = renderStamp({ ...input, phase: 'visible', phaseProgress: 1 });
  const l = layout(input);
  const baseRotation = (input.settings.rotation * Math.PI) / 180;
  const reach = group({
    rotation: baseRotation,
    scale: 1 + SPLASH_GROWTH,
    children: [splashOutline(l, input.settings.inkColor)],
  });
  return boundsOf(finished, ...(input.settings.splash ? [reach] : []));
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export const stampStyle: AnnotationStyleDefinition<StampSettings> = {
  id: 'stamp',
  version: 1,
  name: 'Stamp',
  description: 'A rubber stamp that slams down on the point, round or rectangular',
  category: 'editorial',
  icon: 'stamp',
  contentSlots: ['title', 'subtitle'],
  settingsSchema: stampSettingsSchema,
  defaultSettings: defaultStampSettings,
  supportsAltitude: false,
  defaultAltitude: 0,
  defaultAnchor: 'center',
  defaultOffset: [0, 0],
  drawsConnector: false,
  defaultConnector: { visible: false },
  defaultTransition: {
    enter: 'auto',
    exit: 'auto',
    enterDuration: 0.7,
    exitDuration: 0.4,
  },
  controls: [
    { type: 'color', key: 'inkColor', label: 'Ink color' },
    {
      type: 'select',
      key: 'shape',
      label: 'Shape',
      options: [
        { value: 'round', label: 'Round' },
        { value: 'rect', label: 'Rectangle' },
      ],
    },
    { type: 'slider', key: 'rotation', label: 'Rotation', min: -30, max: 30, step: 1, unit: '°' },
    { type: 'switch', key: 'splash', label: 'Impact ring' },
    { type: 'switch', key: 'halo', label: 'Soft shadow' },
  ],
  render: renderStamp,
  measure: measureStamp,
};

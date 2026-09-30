import { z } from 'zod';
import type { AnnotationStyleDefinition, SceneNode, StyleBounds, StyleRenderInput } from '../types';
import { ANNOTATION_FONTS } from '../fonts';
import { buildProgress, easeInOutCubic, easeOutBack, easeOutCubic, lerp, stage, staggered } from '../motion';
import { arcGlyphGroups, layoutGlyphs, layoutGlyphsOnArc } from '../scene/glyphs';
import { circle, group } from '../scene/primitives';
import { boundsOf, haloShadow } from './shared';

// ─── Settings Schema ──────────────────────────────────────────────────────────

export const radiusRingSettingsSchema = z.object({
  radius: z.number().default(70),
  ringColor: z.string().default('#FFFFFF'),
  accentColor: z.string().default('#FF5A36'),
  dashed: z.boolean().default(true),
  fill: z.boolean().default(true),
  halo: z.boolean().default(true),
  /** Slowly turns the dashes; only has an effect on a dashed ring. */
  spin: z.boolean().default(false),
});

export type RadiusRingSettings = z.infer<typeof radiusRingSettingsSchema>;

export const defaultRadiusRingSettings: RadiusRingSettings = {
  radius: 70,
  ringColor: '#FFFFFF',
  accentColor: '#FF5A36',
  dashed: true,
  fill: true,
  halo: true,
  spin: false,
};

// ─── Layout Constants ─────────────────────────────────────────────────────────

const RING_WIDTH = 1.8;
/** Target dash plus gap length; adjusted so a whole number of dashes fit the ring. */
const DASH_PERIOD = 13;
const DASH_SHARE = 0.55;
const DOT_RADIUS = 4.5;
const FILL_OPACITY = 0.1;
/** Turns per second of the dashes when spinning. */
const SPIN_RATE = 0.02;

const TITLE_SIZE = 13;
const TITLE_WEIGHT = 600;
const TITLE_SPACING = '0.3em';
const SUBTITLE_SIZE = 12;
const SUBTITLE_WEIGHT = 500;
const SUBTITLE_SPACING = '0.2em';
const SUBTITLE_OPACITY = 0.85;
/** Distance from the ring to the middle line of the lettering. */
const TEXT_GAP = 11;
/** Most of the ring a line of lettering may cover, radians. */
const MAX_TEXT_SPAN = (290 * Math.PI) / 180;
const MIN_TEXT_SIZE = 9;

/**
 * Entrance timeline as windows of the 0–1 build progress: the dot pops, the
 * ring draws on from the top while the disc behind it fades in, then the
 * letters arrive one by one along the arcs. The exit plays it backwards.
 */
const DOT_WINDOW = [0, 0.22] as const;
const RING_WINDOW = [0.1, 0.58] as const;
const FILL_WINDOW = [0.32, 0.7] as const;
const TITLE_WINDOW = [0.5, 0.95] as const;
const SUBTITLE_WINDOW = [0.62, 1] as const;

/** Share of the letters' window used to offset their starts. */
const LETTER_SPREAD = 0.6;

// ─── Layout ───────────────────────────────────────────────────────────────────

/** Dash and gap lengths that close up evenly round a ring of the given radius. */
export function dashPattern(radius: number): number[] {
  const period = (Math.PI * 2 * radius) / Math.max(1, Math.round((Math.PI * 2 * radius) / DASH_PERIOD));
  return [period * DASH_SHARE, period * (1 - DASH_SHARE)];
}

interface Lettering {
  size: number;
  spec: { fontSize: number; fontFamily: string; fontWeight: number; letterSpacing: string };
  layout: ReturnType<typeof layoutGlyphs>;
}

/** Lays a line out in uppercase, shrinking the type until it fits within the arc it may cover. */
function lettering(value: string, radius: number, size: number, weight: number, spacing: string): Lettering | null {
  if (!value) return null;
  let fontSize = size;
  for (;;) {
    const spec = { fontSize, fontFamily: ANNOTATION_FONTS.condensed, fontWeight: weight, letterSpacing: spacing };
    const layout = layoutGlyphs(value, { ...spec, textTransform: 'uppercase' });
    if (fontSize <= MIN_TEXT_SIZE || layout.width / radius <= MAX_TEXT_SPAN) return { size: fontSize, spec, layout };
    fontSize -= 1;
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────

export function renderRadiusRing(input: StyleRenderInput<RadiusRingSettings>): SceneNode {
  const { content, settings, phase, phaseProgress, itemTime } = input;
  const r = settings.radius;
  const build = buildProgress(phase, phaseProgress);
  const shadow = haloShadow(settings.halo);

  const dot = stage(build, ...DOT_WINDOW, easeOutBack);
  const ringDraw = stage(build, ...RING_WINDOW, easeInOutCubic);
  const fade = stage(build, ...FILL_WINDOW, easeOutCubic);
  const titleBuild = stage(build, ...TITLE_WINDOW);
  const subtitleBuild = stage(build, ...SUBTITLE_WINDOW);

  const children: SceneNode[] = [];

  if (settings.fill && fade > 0) {
    children.push(circle({ cx: 0, cy: 0, r, fill: settings.ringColor, opacity: FILL_OPACITY * fade }));
  }

  if (ringDraw > 0) {
    const top = -Math.PI / 2;
    const spin = settings.dashed && settings.spin ? itemTime * SPIN_RATE * Math.PI * 2 : 0;
    children.push(group({
      rotation: spin,
      children: [circle({
        cx: 0,
        cy: 0,
        r,
        stroke: settings.ringColor,
        strokeWidth: RING_WIDTH,
        startAngle: top,
        endAngle: top + Math.PI * 2 * ringDraw,
        dashPattern: settings.dashed ? dashPattern(r) : undefined,
        shadow,
      })],
    }));
  }

  if (dot > 0) {
    children.push(group({
      scale: dot,
      children: [circle({ cx: 0, cy: 0, r: DOT_RADIUS, fill: settings.accentColor, stroke: settings.ringColor, strokeWidth: 1, shadow })],
    }));
  }

  const title = lettering((content.title ?? '').trim(), r + TEXT_GAP, TITLE_SIZE, TITLE_WEIGHT, TITLE_SPACING);
  if (title && titleBuild > 0) {
    const glyphs = layoutGlyphsOnArc(title.layout, { radius: r + TEXT_GAP, centerAngle: -Math.PI / 2 });
    children.push(...arcGlyphGroups(glyphs, { ...title.spec, fill: settings.ringColor, shadow }, (_glyph, index) => {
      const t = staggered(titleBuild, index, glyphs.length, LETTER_SPREAD, easeOutCubic);
      return t > 0 ? { group: { opacity: t, scale: lerp(0.6, 1, t) } } : null;
    }));
  }

  const subtitle = lettering((content.subtitle ?? '').trim(), r + TEXT_GAP, SUBTITLE_SIZE, SUBTITLE_WEIGHT, SUBTITLE_SPACING);
  if (subtitle && subtitleBuild > 0) {
    // Along the bottom, counter-clockwise, so it reads upright and left to right.
    const glyphs = layoutGlyphsOnArc(subtitle.layout, { radius: r + TEXT_GAP, centerAngle: Math.PI / 2, direction: 'ccw' });
    children.push(...arcGlyphGroups(glyphs, { ...subtitle.spec, fill: settings.ringColor, shadow }, (_glyph, index) => {
      const t = staggered(subtitleBuild, index, glyphs.length, LETTER_SPREAD, easeOutCubic);
      return t > 0 ? { group: { opacity: t * SUBTITLE_OPACITY, scale: lerp(0.6, 1, t) } } : null;
    }));
  }

  return group({ children });
}

// ─── Measure ──────────────────────────────────────────────────────────────────

/** Bounds of the finished state: the ring and the lettering round it. */
export function measureRadiusRing(input: StyleRenderInput<RadiusRingSettings>): StyleBounds {
  return boundsOf(renderRadiusRing({ ...input, phase: 'visible', phaseProgress: 1 }));
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export const radiusRingStyle: AnnotationStyleDefinition<RadiusRingSettings> = {
  id: 'radius-ring',
  version: 1,
  name: 'Radius Ring',
  description: 'A dashed ring drawn round the point with the label set along its arc',
  category: 'marker',
  icon: 'circle-dashed',
  contentSlots: ['title', 'subtitle'],
  settingsSchema: radiusRingSettingsSchema,
  defaultSettings: defaultRadiusRingSettings,
  supportsAltitude: false,
  defaultAltitude: 0,
  defaultAnchor: 'center',
  defaultOffset: [0, 0],
  drawsConnector: false,
  defaultConnector: { visible: false },
  defaultTransition: {
    enter: 'auto',
    exit: 'auto',
    enterDuration: 1.3,
    exitDuration: 0.5,
  },
  controls: [
    { type: 'slider', key: 'radius', label: 'Radius', min: 30, max: 200, step: 5, unit: 'px' },
    { type: 'color', key: 'ringColor', label: 'Ring color' },
    { type: 'color', key: 'accentColor', label: 'Dot color' },
    { type: 'switch', key: 'dashed', label: 'Dashed' },
    { type: 'switch', key: 'fill', label: 'Faint fill' },
    { type: 'switch', key: 'halo', label: 'Soft shadow' },
    { type: 'switch', key: 'spin', label: 'Spin dashes' },
  ],
  render: renderRadiusRing,
  measure: measureRadiusRing,
};

import { z } from 'zod';
import type { AnnotationStyleDefinition, SceneNode, ShadowConfig, StyleBounds, StyleRenderInput } from '../types';
import { ANNOTATION_FONTS } from '../fonts';
import { buildProgress, easeOutBack, easeOutCubic, stage, staggered } from '../motion';
import { glyphTexts, layoutGlyphs, type GlyphLayout, type TextSpec } from '../scene/glyphs';
import { circle, group, rect, text } from '../scene/primitives';
import { boundsOf, HALO_REACH, haloShadow } from './shared';

// ─── Settings Schema ──────────────────────────────────────────────────────────

export const mapLabelSettingsSchema = z.object({
  variant: z.enum(['place', 'water', 'region']).default('place'),
  /** White means "the variant's own colour": water is a cool blue by default. */
  tint: z.string().default('#FFFFFF'),
  halo: z.boolean().default(true),
  showPoint: z.boolean().default(false),
});

export type MapLabelSettings = z.infer<typeof mapLabelSettingsSchema>;

export const defaultMapLabelSettings: MapLabelSettings = {
  variant: 'place',
  tint: '#FFFFFF',
  halo: true,
  showPoint: false,
};

// ─── Variants ─────────────────────────────────────────────────────────────────

interface VariantSpec {
  fontFamily: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  fontSize: number;
  /** Final letter spacing, in em. */
  tracking: number;
  /** Extra spacing, in em, that the letters start with and tighten out of. */
  entranceExtra: number;
  uppercase: boolean;
  /** Colour used when the tint setting is left at white. */
  defaultTint: string;
  subtitleTracking: number;
}

const VARIANTS: Record<MapLabelSettings['variant'], VariantSpec> = {
  place: {
    fontFamily: ANNOTATION_FONTS.condensed,
    fontWeight: 600,
    fontStyle: 'normal',
    fontSize: 24,
    tracking: 0.25,
    entranceExtra: 0.35,
    uppercase: true,
    defaultTint: '#FFFFFF',
    subtitleTracking: 0.1,
  },
  water: {
    fontFamily: ANNOTATION_FONTS.serif,
    fontWeight: 400,
    fontStyle: 'italic',
    fontSize: 22,
    tracking: 0.14,
    entranceExtra: 0.25,
    uppercase: false,
    defaultTint: '#CFE3FF',
    subtitleTracking: 0.08,
  },
  region: {
    fontFamily: ANNOTATION_FONTS.condensed,
    fontWeight: 500,
    fontStyle: 'normal',
    fontSize: 32,
    tracking: 0.5,
    entranceExtra: 0.3,
    uppercase: true,
    defaultTint: '#FFFFFF',
    subtitleTracking: 0.16,
  },
};

// ─── Layout Constants ─────────────────────────────────────────────────────────

const SUBTITLE_SIZE = 13;
const SUBTITLE_WEIGHT = 500;
const SUBTITLE_OPACITY = 0.85;
/** Space between the bottom of the title and the top of the subtitle. */
const SUBTITLE_GAP = 6;
const SUBTITLE_TRAVEL = 5;
/** How far each letter rises while it fades in. */
const LETTER_RISE = 8;
const POINT_RADIUS = 2.5;
const POINT_GAP = 12;

/** Windows of the 0–1 build progress; letters use most of it, the subtitle trails. */
const LETTERS_WINDOW = [0, 0.8] as const;
const TRACKING_WINDOW = [0, 0.85] as const;
const POINT_WINDOW = [0, 0.3] as const;
const SUBTITLE_WINDOW = [0.72, 1] as const;
const LETTER_SPREAD = 0.6;

// ─── Layout ───────────────────────────────────────────────────────────────────

interface Layout {
  spec: VariantSpec;
  tint: string;
  subtitle: string;
  textSpec: TextSpec;
  glyphs: GlyphLayout;
  /** Width of the finished title, without the spacing after its last letter. */
  titleWidth: number;
  /** Extra gap between neighbouring letters at the very start of the entrance. */
  extraPx: number;
  subtitleTrackingPx: number;
}

function layout(input: StyleRenderInput<MapLabelSettings>): Layout {
  const { content, settings } = input;
  const spec = VARIANTS[settings.variant];
  const title = (content.title ?? '').trim();
  const textSpec: TextSpec = {
    fontSize: spec.fontSize,
    fontFamily: spec.fontFamily,
    fontWeight: spec.fontWeight,
    fontStyle: spec.fontStyle,
    letterSpacing: `${spec.tracking}em`,
    textTransform: spec.uppercase ? 'uppercase' : 'none',
  };
  const glyphs = layoutGlyphs(title, textSpec);
  return {
    spec,
    tint: settings.tint.toUpperCase() === '#FFFFFF' ? spec.defaultTint : settings.tint,
    subtitle: (content.subtitle ?? '').trim(),
    textSpec,
    glyphs,
    titleWidth: title ? Math.max(0, glyphs.width - spec.tracking * spec.fontSize) : 0,
    extraPx: spec.entranceExtra * spec.fontSize,
    subtitleTrackingPx: spec.subtitleTracking * SUBTITLE_SIZE,
  };
}

// ─── Render ───────────────────────────────────────────────────────────────────

export function renderMapLabel(input: StyleRenderInput<MapLabelSettings>): SceneNode {
  const { settings, phase, phaseProgress } = input;
  const { spec, tint, subtitle, glyphs, textSpec, titleWidth, extraPx, subtitleTrackingPx } = layout(input);
  const build = buildProgress(phase, phaseProgress);
  const shadow = haloShadow(settings.halo);
  const count = glyphs.glyphs.length;

  // Tracking tightens from wider to final as the letters arrive.
  const extra = (1 - stage(build, ...TRACKING_WINDOW, easeOutCubic)) * extraPx;
  const width = titleWidth + Math.max(0, count - 1) * extra;
  const letters = stage(build, ...LETTERS_WINDOW);

  const children: SceneNode[] = [];

  const point = stage(build, ...POINT_WINDOW, easeOutBack);
  if (settings.showPoint && count > 0 && point > 0) {
    children.push(group({
      x: -width / 2 - POINT_GAP,
      scale: point,
      children: [circle({ cx: 0, cy: 0, r: POINT_RADIUS, fill: tint, shadow })],
    }));
  }

  children.push(...glyphTexts(
    glyphs,
    { ...textSpec, x: 0, y: 0, baseline: 'middle', fill: tint, shadow },
    (glyph) => {
      const reveal = staggered(letters, glyph.index, count, LETTER_SPREAD, easeOutCubic);
      if (reveal <= 0) return null;
      return {
        x: -width / 2 + glyph.x + glyph.index * extra,
        y: (1 - reveal) * LETTER_RISE,
        opacity: reveal,
        // Spacing is already in the glyph positions.
        letterSpacing: undefined,
      };
    },
  ));

  const subtitleReveal = stage(build, ...SUBTITLE_WINDOW, easeOutCubic);
  if (subtitle && subtitleReveal > 0) {
    children.push(text({
      // Canvas letter spacing also trails the last character; nudge back to centre.
      x: subtitleTrackingPx / 2,
      y: spec.fontSize * 0.5 + SUBTITLE_GAP + (1 - subtitleReveal) * SUBTITLE_TRAVEL,
      text: subtitle,
      fontSize: SUBTITLE_SIZE,
      fontFamily: ANNOTATION_FONTS.condensed,
      fontWeight: SUBTITLE_WEIGHT,
      letterSpacing: `${spec.subtitleTracking}em`,
      fill: tint,
      align: 'center',
      baseline: 'top',
      opacity: subtitleReveal * SUBTITLE_OPACITY,
      shadow,
    }));
  }

  return group({ children });
}

// ─── Measure ──────────────────────────────────────────────────────────────────

/**
 * Bounds of the finished label, widened to the loosest tracking the entrance
 * starts from and to the rise the letters travel, so nothing is cropped
 * mid-animation.
 */
export function measureMapLabel(input: StyleRenderInput<MapLabelSettings>): StyleBounds {
  const finished = renderMapLabel({ ...input, phase: 'visible', phaseProgress: 1 });
  const { glyphs, titleWidth, extraPx, spec } = layout(input);
  const count = glyphs.glyphs.length;
  const widest = titleWidth + Math.max(0, count - 1) * extraPx;
  const reach = widest / 2 + (input.settings.showPoint ? POINT_GAP + POINT_RADIUS : 0) + HALO_REACH;
  const extent = count > 0
    ? [rect({
        x: -reach,
        y: -spec.fontSize * 0.65 - HALO_REACH,
        width: reach * 2,
        height: spec.fontSize * 1.3 + LETTER_RISE + HALO_REACH * 2,
      })]
    : [];
  return boundsOf(finished, ...extent);
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export const mapLabelStyle: AnnotationStyleDefinition<MapLabelSettings> = {
  id: 'map-label',
  version: 1,
  name: 'Map Label',
  description: 'Cartographic lettering set on the point: tracked capitals, water italics or a wide region name',
  category: 'label',
  icon: 'type',
  contentSlots: ['title', 'subtitle'],
  settingsSchema: mapLabelSettingsSchema,
  defaultSettings: defaultMapLabelSettings,
  supportsAltitude: false,
  defaultAltitude: 0,
  defaultOffset: [0, 0],
  defaultAnchor: 'center',
  defaultTransition: {
    enter: 'auto',
    exit: 'auto',
    enterDuration: 1.1,
    exitDuration: 0.6,
  },
  controls: [
    {
      type: 'select',
      key: 'variant',
      label: 'Variant',
      options: [
        { value: 'place', label: 'Place' },
        { value: 'water', label: 'Water' },
        { value: 'region', label: 'Region' },
      ],
    },
    { type: 'color', key: 'tint', label: 'Tint' },
    { type: 'switch', key: 'halo', label: 'Soft shadow' },
    { type: 'switch', key: 'showPoint', label: 'Point marker' },
  ],
  render: renderMapLabel,
  measure: measureMapLabel,
};

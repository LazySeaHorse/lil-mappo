import { z } from 'zod';
import type { AnnotationStyleDefinition, SceneNode, ShadowConfig, StyleBounds, StyleRenderInput } from '../types';
import { ANNOTATION_FONTS } from '../fonts';
import { buildProgress, easeOutBack, easeOutCubic, lerp, stage } from '../motion';
import { circle, group, text } from '../scene/primitives';
import { formatCountUp } from '../numbers';
import { measureTextWidth } from '../scene/textMetrics';
import { boundsOf, HALO_REACH, haloShadow } from './shared';

// ─── Settings Schema ──────────────────────────────────────────────────────────

export const waypointSettingsSchema = z.object({
  accentColor: z.string().default('#FF5A36'),
  textColor: z.string().default('#FFFFFF'),
  side: z.enum(['auto', 'left', 'right']).default('auto'),
  halo: z.boolean().default(true),
  size: z.number().default(36),
});

export type WaypointSettings = z.infer<typeof waypointSettingsSchema>;

export const defaultWaypointSettings: WaypointSettings = {
  accentColor: '#FF5A36',
  textColor: '#FFFFFF',
  side: 'auto',
  halo: true,
  size: 36,
};

// ─── Layout Constants ─────────────────────────────────────────────────────────

const TITLE_SIZE = 24;
const TITLE_WEIGHT = 600;
const TITLE_SPACING = '0.05em';
const SUBTITLE_SIZE = 15;
const SUBTITLE_WEIGHT = 500;
const SUBTITLE_OPACITY = 0.88;
/** Space between the ring and the text block. */
const TEXT_GAP = 10;
/** Distance from the disc edge to the ring. */
const RING_GAP = 6;
/** Extra reach of the ring while it overshoots on the way in. */
const RING_OVERSHOOT_ROOM = 5;
const RING_WIDTH = 2;
const DISC_OUTLINE = 2;
/** Vertical spacing of the two-line text block, from the disc's centre line. */
const TITLE_RAISE = 9;
const SUBTITLE_DROP = 12;
const SUBTITLE_TRAVEL = 6;
const MIN_BADGE_FONT = 9;
/** Share of the disc's diameter the badge text may fill. */
const BADGE_FILL = 0.74;

const DISC_SHADOW: ShadowConfig = { color: 'rgba(0, 0, 0, 0.5)', blur: 10, offsetX: 0, offsetY: 2 };

/** Entrance timeline, as overlapping windows of the 0–1 build progress. */
const DISC_WINDOW = [0, 0.36] as const;
const RING_WINDOW = [0.08, 0.56] as const;
const NUMBER_WINDOW = [0.16, 0.56] as const;
const TITLE_WINDOW = [0.36, 0.8] as const;
const SUBTITLE_WINDOW = [0.52, 0.96] as const;

// ─── Layout ───────────────────────────────────────────────────────────────────

/** Whole numbers up to 99 tick up from 0; anything else fades in. */
export function parseTickNumber(badge: string): number | null {
  return /^\d{1,2}$/.test(badge) ? Number(badge) : null;
}

interface Layout {
  direction: 1 | -1;
  radius: number;
  badge: string;
  badgeSize: number;
  title: string;
  subtitle: string;
  titleWidth: number;
  subtitleWidth: number;
}

/** +1 when the name extends right of the disc, -1 when it extends left. There is no auto: the disc sits on the point. */
export function resolveDirection(side: WaypointSettings['side']): 1 | -1 {
  return side === 'left' ? -1 : 1;
}

function layout(input: StyleRenderInput<WaypointSettings>): Layout {
  const { content, settings } = input;
  const radius = settings.size / 2;
  const badge = (content.badge ?? '').trim() || '•';
  const title = (content.title ?? '').trim().toUpperCase();
  const subtitle = (content.subtitle ?? '').trim();

  const baseBadgeSize = Math.round(radius * 1.05);
  const badgeWidth = measureTextWidth(badge, baseBadgeSize, ANNOTATION_FONTS.condensed, 700);
  const fits = badgeWidth <= radius * 2 * BADGE_FILL;
  const badgeSize = fits
    ? baseBadgeSize
    : Math.max(MIN_BADGE_FONT, Math.floor((baseBadgeSize * radius * 2 * BADGE_FILL) / badgeWidth));

  return {
    direction: resolveDirection(settings.side),
    radius,
    badge,
    badgeSize,
    title,
    subtitle,
    titleWidth: title ? measureTextWidth(title, TITLE_SIZE, ANNOTATION_FONTS.condensed, TITLE_WEIGHT, TITLE_SPACING) : 0,
    subtitleWidth: subtitle ? measureTextWidth(subtitle, SUBTITLE_SIZE, ANNOTATION_FONTS.condensed, SUBTITLE_WEIGHT) : 0,
  };
}

// ─── Render ───────────────────────────────────────────────────────────────────

export function renderWaypoint(input: StyleRenderInput<WaypointSettings>): SceneNode {
  const { settings, phase, phaseProgress } = input;
  const { direction, radius, badge, badgeSize, title, subtitle, titleWidth, subtitleWidth } = layout(input);
  const build = buildProgress(phase, phaseProgress);

  const discScale = stage(build, ...DISC_WINDOW, easeOutBack);
  const ring = stage(build, ...RING_WINDOW, (t) => easeOutBack(t, 2.4));
  const numberProgress = stage(build, ...NUMBER_WINDOW, easeOutCubic);
  const titleReveal = stage(build, ...TITLE_WINDOW, easeOutCubic);
  const subtitleReveal = stage(build, ...SUBTITLE_WINDOW, easeOutCubic);

  const shadow = haloShadow(settings.halo);
  const ringRadius = radius + RING_GAP;
  const textEdge = direction * (ringRadius + RING_OVERSHOOT_ROOM + TEXT_GAP);
  const align = direction === 1 ? 'left' : 'right';
  const hasSubtitle = subtitle !== '';
  const clipWidth = Math.max(titleWidth, subtitleWidth) + HALO_REACH * 2 + radius * 2 + TEXT_GAP;
  const clipHeight = TITLE_SIZE * 3 + HALO_REACH * 2;

  const children: SceneNode[] = [];

  // Text first, so the disc and ring cover it while it slides out from behind.
  // The clip starts at the disc's centre line: whatever has not yet passed it is hidden.
  if ((title || hasSubtitle) && titleReveal > 0) {
    const travel = titleWidth + ringRadius + TEXT_GAP;
    const slide = (1 - titleReveal) * -direction * travel;
    const lines: SceneNode[] = [];
    if (title) {
      lines.push(text({
        x: textEdge + slide,
        y: hasSubtitle ? -TITLE_RAISE : 0,
        text: title,
        fontSize: TITLE_SIZE,
        fontFamily: ANNOTATION_FONTS.condensed,
        fontWeight: TITLE_WEIGHT,
        letterSpacing: TITLE_SPACING,
        fill: settings.textColor,
        align,
        baseline: 'middle',
        shadow,
      }));
    }
    children.push(group({
      clip: {
        x: direction === 1 ? 0 : -clipWidth,
        y: -clipHeight / 2,
        width: clipWidth,
        height: clipHeight,
      },
      children: lines,
    }));
  }

  if (hasSubtitle && subtitleReveal > 0) {
    const slide = (1 - subtitleReveal) * -direction * SUBTITLE_TRAVEL * 3;
    children.push(text({
      x: textEdge + slide,
      y: SUBTITLE_DROP + (title ? 0 : -SUBTITLE_DROP),
      text: subtitle,
      fontSize: SUBTITLE_SIZE,
      fontFamily: ANNOTATION_FONTS.condensed,
      fontWeight: SUBTITLE_WEIGHT,
      fill: settings.textColor,
      align,
      baseline: 'middle',
      opacity: subtitleReveal * SUBTITLE_OPACITY,
      shadow,
    }));
  }

  if (ring > 0) {
    children.push(circle({
      cx: 0,
      cy: 0,
      r: lerp(radius, ringRadius, ring),
      stroke: settings.accentColor,
      strokeWidth: RING_WIDTH,
      opacity: Math.min(1, ring * 2),
      shadow,
    }));
  }

  if (discScale > 0) {
    const tick = parseTickNumber(badge);
    const label = tick === null ? badge : formatCountUp(tick, numberProgress, { decimals: 0 });
    children.push(group({
      scale: discScale,
      children: [
        circle({
          cx: 0,
          cy: 0,
          r: radius,
          fill: settings.accentColor,
          stroke: '#FFFFFF',
          strokeWidth: DISC_OUTLINE,
          shadow: settings.halo ? DISC_SHADOW : undefined,
        }),
        text({
          x: 0,
          y: 1,
          text: label,
          fontSize: badgeSize,
          fontFamily: ANNOTATION_FONTS.condensed,
          fontWeight: 700,
          fill: settings.textColor,
          align: 'center',
          baseline: 'middle',
          opacity: tick === null ? numberProgress : 1,
        }),
      ],
    }));
  }

  return group({ children });
}

// ─── Measure ──────────────────────────────────────────────────────────────────

/** Bounds of the finished state, with room for the ring's overshoot. */
export function measureWaypoint(input: StyleRenderInput<WaypointSettings>): StyleBounds {
  const { radius } = layout(input);
  const finished = renderWaypoint({ ...input, phase: 'visible', phaseProgress: 1 });
  const reach = radius + RING_GAP + RING_OVERSHOOT_ROOM;
  return boundsOf(finished, circle({ cx: 0, cy: 0, r: reach, stroke: input.settings.accentColor, strokeWidth: RING_WIDTH }));
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export const waypointStyle: AnnotationStyleDefinition<WaypointSettings> = {
  id: 'waypoint',
  version: 1,
  name: 'Waypoint',
  description: 'A numbered disc on the point with the place name sliding out beside it',
  category: 'marker',
  icon: 'list-ordered',
  contentSlots: ['title', 'subtitle', 'badge'],
  settingsSchema: waypointSettingsSchema,
  defaultSettings: defaultWaypointSettings,
  supportsAltitude: false,
  defaultAltitude: 0,
  defaultOffset: [0, 0],
  defaultAnchor: 'center',
  drawsConnector: false,
  defaultConnector: { visible: false },
  defaultTransition: {
    enter: 'auto',
    exit: 'auto',
    enterDuration: 1.1,
    exitDuration: 0.5,
  },
  controls: [
    { type: 'color', key: 'accentColor', label: 'Disc color' },
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
    { type: 'slider', key: 'size', label: 'Size', min: 24, max: 64, step: 2, unit: 'px' },
  ],
  render: renderWaypoint,
  measure: measureWaypoint,
};

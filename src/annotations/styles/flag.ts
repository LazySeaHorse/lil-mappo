import { z } from 'zod';
import type { AnnotationStyleDefinition, SceneNode, ShadowConfig, StyleBounds, StyleRenderInput } from '../types';
import { ANNOTATION_FONTS } from '../fonts';
import { buildProgress, clamp01, easeOutBack, easeOutCubic, stage } from '../motion';
import { arcPoints } from '../scene/geometry';
import { measureScene } from '../scene/measure';
import { circle, group, path, polyline, text } from '../scene/primitives';
import { measureTextWidth } from '../scene/textMetrics';
import { HALO_SHADOW } from './shared';

// ─── Settings Schema ──────────────────────────────────────────────────────────

export const flagSettingsSchema = z.object({
  clothColor: z.string().default('#FF5A36'),
  textColor: z.string().default('#FFFFFF'),
  poleColor: z.string().default('#EDEDED'),
  shape: z.enum(['rect', 'swallowtail', 'pennant']).default('swallowtail'),
  wave: z.boolean().default(true),
});

export type FlagSettings = z.infer<typeof flagSettingsSchema>;

export const defaultFlagSettings: FlagSettings = {
  clothColor: '#FF5A36',
  textColor: '#FFFFFF',
  poleColor: '#EDEDED',
  shape: 'swallowtail',
  wave: true,
};

// ─── Layout Constants ─────────────────────────────────────────────────────────

const TITLE_SIZE = 20;
const TITLE_WEIGHT = 700;
const TITLE_SPACING = '0.06em';
const SUBTITLE_SIZE = 14;
const SUBTITLE_WEIGHT = 500;
const SUBTITLE_GAP = 8;

const POLE_WIDTH = 2.5;
const FINIAL_RADIUS = 3.5;
/** Shortest pole drawn, so a flag placed at ground level still stands up. */
const MIN_POLE_HEIGHT = 56;

const CLOTH_HEIGHT = 40;
const CLOTH_PAD = 12;
/** Depth of the swallowtail's notch. */
const NOTCH_DEPTH = 14;
/** Share of a pennant's length that holds the title (its height there is 45% of full). */
const PENNANT_TEXT_SHARE = 0.55;
const MIN_CLOTH_WIDTH = 64;

const BASE_RADIUS_X = 13;
const BASE_RADIUS_Y = 4;

/** How far the far edge of the cloth swings, in pixels, and the ripple's shape. */
const RIPPLE_AMPLITUDE = 3.4;
const RIPPLE_WAVELENGTH = 78;
const RIPPLE_PERIOD = 1.7;
/** Frozen phase for the still cloth when `wave` is off. */
const STILL_PHASE = 1.1;
/** Extra ripple thrown while the cloth unfurls, settling to nothing. */
const UNFURL_AMPLITUDE = 7;
const CLOTH_COLUMNS_PER_PX = 1 / 7;
/** Darkest fold shade over the cloth. */
const FOLD_SHADE = 0.2;

const CLOTH_SHADOW: ShadowConfig = { color: 'rgba(0, 0, 0, 0.35)', blur: 8, offsetX: 0, offsetY: 3 };

/** Entrance timeline, as overlapping windows of the 0–1 build progress. */
const BASE_WINDOW = [0, 0.22] as const;
const POLE_WINDOW = [0.02, 0.42] as const;
const FINIAL_WINDOW = [0.32, 0.5] as const;
const CLOTH_WINDOW = [0.34, 0.86] as const;
const TITLE_WINDOW = [0.5, 0.86] as const;
const SUBTITLE_WINDOW = [0.72, 1] as const;

// ─── Layout ───────────────────────────────────────────────────────────────────

type Pt = [number, number];

interface Layout {
  title: string;
  subtitle: string;
  titleWidth: number;
  /** Top of the pole, where the cloth hangs from. */
  top: Pt;
  /** Left edge of the cloth (the pole's right side). */
  clothX: number;
  clothWidth: number;
  /** Where the title sits on the cloth, relative to the cloth's left edge. */
  textX: number;
}

function layout(input: StyleRenderInput<FlagSettings>): Layout {
  const { content, settings, ground } = input;
  const title = (content.title ?? '').trim().toUpperCase();
  const subtitle = (content.subtitle ?? '').trim();
  const titleWidth = title
    ? measureTextWidth(title, TITLE_SIZE, ANNOTATION_FONTS.condensed, TITLE_WEIGHT, TITLE_SPACING)
    : 0;

  // The pole is the connector: it runs from the ground point to the origin,
  // or stands a minimum height when the origin is too close to the ground.
  const reach = Math.hypot(ground.x, ground.y);
  const top: Pt = reach >= MIN_POLE_HEIGHT ? [0, 0] : [ground.x, ground.y - MIN_POLE_HEIGHT];

  const textSpan = titleWidth + CLOTH_PAD * 2;
  let clothWidth: number;
  let textX: number;
  switch (settings.shape) {
    case 'pennant':
      // The title has to sit where the point is still tall enough for it.
      clothWidth = Math.max(textSpan / PENNANT_TEXT_SHARE, MIN_CLOTH_WIDTH);
      textX = CLOTH_PAD;
      break;
    case 'swallowtail':
      clothWidth = Math.max(textSpan + NOTCH_DEPTH * 0.6, MIN_CLOTH_WIDTH);
      textX = CLOTH_PAD;
      break;
    default:
      clothWidth = Math.max(textSpan, MIN_CLOTH_WIDTH);
      textX = CLOTH_PAD;
  }

  return {
    title,
    subtitle,
    titleWidth,
    top,
    clothX: top[0] + POLE_WIDTH / 2,
    clothWidth: Math.ceil(clothWidth),
    textX,
  };
}

// ─── Cloth geometry ───────────────────────────────────────────────────────────

/** Vertical ripple at distance `x` along the cloth: pinned at the pole, freer towards the far end. */
function ripple(x: number, clothWidth: number, phase: number, amplitude: number): number {
  const envelope = clamp01(x / clothWidth);
  return amplitude * envelope * Math.sin((x / RIPPLE_WAVELENGTH) * Math.PI * 2 - phase);
}

/** Slope of the ripple at `x`, for tilting the title with the cloth. */
function rippleSlope(x: number, clothWidth: number, phase: number, amplitude: number): number {
  const h = 1;
  return (ripple(x + h, clothWidth, phase, amplitude) - ripple(x - h, clothWidth, phase, amplitude)) / (2 * h);
}

/** The cloth's bottom edge, at distance `x` along an unrippled cloth of `width`. */
function bottomEdge(shape: FlagSettings['shape'], x: number, width: number): number {
  if (shape !== 'pennant') return CLOTH_HEIGHT;
  return CLOTH_HEIGHT - (CLOTH_HEIGHT / 2) * (x / width);
}
function topEdge(shape: FlagSettings['shape'], x: number, width: number): number {
  if (shape !== 'pennant') return 0;
  return (CLOTH_HEIGHT / 2) * (x / width);
}

function columnCount(width: number): number {
  return Math.max(6, Math.round(width * CLOTH_COLUMNS_PER_PX));
}

/**
 * The cloth outline, clockwise from the pole's top corner, drawn `reveal` of
 * the way out from the pole. The final width is `clothWidth`; the ripple is
 * measured along the cloth, so the wave stays put while the cloth extends.
 */
function clothOutline(
  shape: FlagSettings['shape'],
  clothWidth: number,
  reveal: number,
  wave: (x: number) => number,
): Pt[] {
  const width = clothWidth * reveal;
  const n = columnCount(width);
  const along = (i: number) => (width * i) / n;
  const topRow: Pt[] = Array.from({ length: n + 1 }, (_, i) => [along(i), topEdge(shape, along(i), width)]);
  const bottomRow: Pt[] = Array.from({ length: n + 1 }, (_, i) => [along(i), bottomEdge(shape, along(i), width)]).reverse() as Pt[];

  let points: Pt[];
  if (shape === 'pennant') {
    // The two edges meet at the tip.
    points = [...topRow.slice(0, -1), [width, CLOTH_HEIGHT / 2], ...bottomRow.slice(1)];
  } else if (shape === 'swallowtail') {
    points = [...topRow, [width - NOTCH_DEPTH * reveal, CLOTH_HEIGHT / 2], ...bottomRow];
  } else {
    points = [...topRow, ...bottomRow];
  }
  return points.map(([x, y]) => [x, y + wave(x)]);
}

/** SVG path text for a closed polygon. */
function polygonPath(points: readonly Pt[]): string {
  return `${points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')} Z`;
}

// ─── Render ───────────────────────────────────────────────────────────────────

export function renderFlag(input: StyleRenderInput<FlagSettings>): SceneNode {
  const { settings, ground, phase, phaseProgress, itemTime } = input;
  const { title, subtitle, titleWidth, top, clothX, clothWidth, textX } = layout(input);
  const build = buildProgress(phase, phaseProgress);

  const base = stage(build, ...BASE_WINDOW, easeOutBack);
  const pole = stage(build, ...POLE_WINDOW, easeOutCubic);
  const finial = stage(build, ...FINIAL_WINDOW, easeOutBack);
  const unfurl = stage(build, ...CLOTH_WINDOW, easeOutCubic);
  const titleReveal = stage(build, ...TITLE_WINDOW, easeOutCubic);
  const subtitleReveal = stage(build, ...SUBTITLE_WINDOW, easeOutCubic);

  const children: SceneNode[] = [];

  // Base: a flattened shadow ellipse with a lighter ring, growing from the ground point.
  if (base > 0) {
    const ellipse = (rx: number, ry: number): Pt[] =>
      arcPoints(0, 0, 1, 0, Math.PI * 2, 32).map(([x, y]) => [ground.x + x * rx * base, ground.y + y * ry * base]);
    children.push(path({ d: polygonPath(ellipse(BASE_RADIUS_X, BASE_RADIUS_Y)), fill: 'rgba(0, 0, 0, 0.4)' }));
    children.push(polyline({
      points: ellipse(BASE_RADIUS_X, BASE_RADIUS_Y),
      closed: true,
      stroke: settings.clothColor,
      strokeWidth: 1.25,
      opacity: 0.85,
    }));
  }

  if (pole > 0) {
    children.push(polyline({
      points: [[ground.x, ground.y], top],
      progress: pole,
      stroke: settings.poleColor,
      strokeWidth: POLE_WIDTH,
      lineCap: 'round',
      shadow: HALO_SHADOW,
    }));
  }

  if (finial > 0) {
    children.push(circle({
      cx: top[0],
      cy: top[1] - 1,
      r: FINIAL_RADIUS * finial,
      fill: settings.poleColor,
      shadow: HALO_SHADOW,
    }));
  }

  if (unfurl > 0) {
    // Ripple: gentle and continuous when `wave` is on, frozen otherwise. The
    // unfurl adds a bigger swing that dies away as the cloth opens.
    const phaseNow = settings.wave ? (itemTime / RIPPLE_PERIOD) * Math.PI * 2 : STILL_PHASE;
    const wave = (x: number) =>
      ripple(x, clothWidth, phaseNow, RIPPLE_AMPLITUDE) +
      ripple(x, clothWidth, build * 14, (1 - unfurl) * UNFURL_AMPLITUDE);

    const outline = clothOutline(settings.shape, clothWidth, unfurl, wave);
    const cloth: SceneNode[] = [
      path({ d: polygonPath(outline), fill: settings.clothColor, shadow: CLOTH_SHADOW }),
    ];

    // Fold shading: a translucent dark band per column, stronger where the
    // cloth turns away from the light (its ripple descending).
    const width = clothWidth * unfurl;
    const columns = columnCount(width);
    const shadeLimit = settings.shape === 'swallowtail' ? width - NOTCH_DEPTH * unfurl : width;
    for (let i = 0; i < columns; i++) {
      const x0 = (width * i) / columns;
      const x1 = (width * (i + 1)) / columns;
      if (x1 > shadeLimit) break;
      const slope = rippleSlope((x0 + x1) / 2, clothWidth, phaseNow, RIPPLE_AMPLITUDE);
      const shade = clamp01(slope * 0.45) * FOLD_SHADE;
      if (shade < 0.01) continue;
      cloth.push(path({
        d: polygonPath([
          [x0, topEdge(settings.shape, x0, width) + wave(x0)],
          [x1, topEdge(settings.shape, x1, width) + wave(x1)],
          [x1, bottomEdge(settings.shape, x1, width) + wave(x1)],
          [x0, bottomEdge(settings.shape, x0, width) + wave(x0)],
        ]),
        fill: `rgba(0, 0, 0, ${shade.toFixed(3)})`,
      }));
    }

    if (title && titleReveal > 0) {
      // The title rides the cloth: it follows the ripple at its middle and
      // tilts with the local slope (gently, so it stays readable).
      const middle = textX + titleWidth / 2;
      const tilt = settings.wave ? rippleSlope(middle, clothWidth, phaseNow, RIPPLE_AMPLITUDE) * 0.5 : 0;
      cloth.push(group({
        clip: { x: 0, y: -RIPPLE_AMPLITUDE * 3, width: width, height: CLOTH_HEIGHT + RIPPLE_AMPLITUDE * 6 },
        children: [
          group({
            x: middle,
            y: CLOTH_HEIGHT / 2 + wave(middle),
            rotation: Math.atan(tilt),
            opacity: titleReveal,
            children: [text({
              x: -titleWidth / 2,
              y: 1,
              text: title,
              fontSize: TITLE_SIZE,
              fontFamily: ANNOTATION_FONTS.condensed,
              fontWeight: TITLE_WEIGHT,
              letterSpacing: TITLE_SPACING,
              fill: settings.textColor,
              align: 'left',
              baseline: 'middle',
              shadow: { color: 'rgba(0, 0, 0, 0.25)', blur: 2, offsetX: 0, offsetY: 1 },
            })],
          }),
        ],
      }));
    }

    children.push(group({ x: clothX, y: top[1], children: cloth }));
  }

  if (subtitle && subtitleReveal > 0) {
    children.push(text({
      x: clothX + 2,
      y: top[1] + CLOTH_HEIGHT + RIPPLE_AMPLITUDE + SUBTITLE_GAP - (1 - subtitleReveal) * 6,
      text: subtitle,
      fontSize: SUBTITLE_SIZE,
      fontFamily: ANNOTATION_FONTS.condensed,
      fontWeight: SUBTITLE_WEIGHT,
      fill: settings.textColor,
      align: 'left',
      baseline: 'top',
      opacity: subtitleReveal * 0.9,
      shadow: HALO_SHADOW,
    }));
  }

  return group({ children });
}

// ─── Measure ──────────────────────────────────────────────────────────────────

/**
 * Bounds of the finished state. Filled paths can't be measured from the scene,
 * so the cloth and the base ellipse are added as boxes of their own.
 */
export function measureFlag(input: StyleRenderInput<FlagSettings>): StyleBounds {
  const { ground } = input;
  const { clothX, clothWidth, top } = layout(input);
  const finished = renderFlag({ ...input, phase: 'visible', phaseProgress: 1 });
  const scene = measureScene(finished);

  const swing = RIPPLE_AMPLITUDE + 1;
  const cloth = {
    minX: clothX,
    minY: top[1] - swing - CLOTH_SHADOW.blur,
    maxX: clothX + clothWidth + CLOTH_SHADOW.blur,
    maxY: top[1] + CLOTH_HEIGHT + swing + CLOTH_SHADOW.blur + (CLOTH_SHADOW.offsetY ?? 0),
  };
  const baseBox = {
    minX: ground.x - BASE_RADIUS_X,
    minY: ground.y - BASE_RADIUS_Y,
    maxX: ground.x + BASE_RADIUS_X,
    maxY: ground.y + BASE_RADIUS_Y,
  };
  const minX = Math.min(scene.minX, cloth.minX, baseBox.minX);
  const minY = Math.min(scene.minY, cloth.minY, baseBox.minY);
  const maxX = Math.max(scene.maxX, cloth.maxX, baseBox.maxX);
  const maxY = Math.max(scene.maxY, cloth.maxY, baseBox.maxY);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export const flagStyle: AnnotationStyleDefinition<FlagSettings> = {
  id: 'flag',
  version: 1,
  name: 'Flag',
  description: 'A pole planted at the point with a flag that unfurls from the top',
  category: 'marker',
  icon: 'flag',
  contentSlots: ['title', 'subtitle'],
  settingsSchema: flagSettingsSchema,
  defaultSettings: defaultFlagSettings,
  supportsAltitude: true,
  defaultAltitude: 90,
  defaultOffset: [0, 0],
  drawsConnector: true,
  defaultConnector: { visible: false },
  defaultTransition: {
    enter: 'auto',
    exit: 'auto',
    enterDuration: 1.4,
    exitDuration: 0.6,
  },
  controls: [
    { type: 'color', key: 'clothColor', label: 'Flag color' },
    { type: 'color', key: 'textColor', label: 'Text color' },
    { type: 'color', key: 'poleColor', label: 'Pole color' },
    {
      type: 'select',
      key: 'shape',
      label: 'Shape',
      options: [
        { value: 'rect', label: 'Rectangle' },
        { value: 'swallowtail', label: 'Swallowtail' },
        { value: 'pennant', label: 'Pennant' },
      ],
    },
    { type: 'switch', key: 'wave', label: 'Wave' },
  ],
  render: renderFlag,
  measure: measureFlag,
};

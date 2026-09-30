import { z } from 'zod';
import type { AnnotationStyleDefinition, SceneNode, ShadowConfig, StyleBounds, StyleRenderInput } from '../types';
import { ANNOTATION_FONTS } from '../fonts';
import { buildProgress, easeInOutCubic, easeOutBack, easeOutCubic, stage } from '../motion';
import { decimalPlaces, formatCountUp, formatNumber } from '../numbers';
import { measureScene } from '../scene/measure';
import { circle, group, polyline, rect, text } from '../scene/primitives';
import { measureTextWidth } from '../scene/textMetrics';

// ─── Settings Schema ──────────────────────────────────────────────────────────

export const bigNumberSettingsSchema = z.object({
  accentColor: z.string().default('#FF5A36'),
  textColor: z.string().default('#FFFFFF'),
  halo: z.boolean().default(true),
  side: z.enum(['auto', 'left', 'right']).default('auto'),
  prefix: z.string().default(''),
});

export type BigNumberSettings = z.infer<typeof bigNumberSettingsSchema>;

export const defaultBigNumberSettings: BigNumberSettings = {
  accentColor: '#FF5A36',
  textColor: '#FFFFFF',
  halo: true,
  side: 'auto',
  prefix: '',
};

// ─── Layout Constants ─────────────────────────────────────────────────────────

const NUMBER_SIZE = 56;
const NUMBER_WEIGHT = 700;
const NUMBER_SPACING = '0.01em';
/** Baseline of the number, above the bar. */
const NUMBER_BASELINE = -10;
const UNIT_SIZE = 28;
const UNIT_WEIGHT = 600;
/** The unit's baseline sits this far above the number's, so it reads as raised. */
const UNIT_RAISE = 20;
const UNIT_GAP = 4;
const LABEL_SIZE = 12;
const LABEL_WEIGHT = 600;
const LABEL_SPACING = '0.18em';
const LABEL_GAP = 9;
const LABEL_SLIDE = 12;
const BAR_WIDTH = 3;
const MIN_WIDTH = 64;
/** The number starts this far low and settles up as the count lands. */
const SETTLE_DROP = 4;

const DOT_RADIUS = 4;
const RING_RADIUS = 8;
const LINE_WIDTH = 1.5;

const HALO_SHADOW: ShadowConfig = { color: 'rgba(0, 0, 0, 0.7)', blur: 6, offsetX: 0, offsetY: 0 };

/** Windows of the 0–1 build progress: dot and line, then the count with its bar, label alongside. */
const DOT_WINDOW = [0, 0.16] as const;
const LINE_WINDOW = [0.06, 0.34] as const;
const COUNT_WINDOW = [0.28, 0.84] as const;
const NUMBER_FADE_WINDOW = [0.28, 0.4] as const;
const SETTLE_WINDOW = [0.72, 0.96] as const;
const LABEL_WINDOW = [0.55, 0.92] as const;

// ─── Layout ───────────────────────────────────────────────────────────────────

export function resolveDirection(side: BigNumberSettings['side'], groundX: number): 1 | -1 {
  if (side === 'left') return -1;
  if (side === 'right') return 1;
  return groundX > 0 ? -1 : 1;
}

interface Layout {
  direction: 1 | -1;
  /** Text of the finished number, prefix included; the title when there is no metric. */
  finalNumber: string;
  /** Whether the number counts up. */
  counts: boolean;
  unit: string;
  label: string;
  numberWidth: number;
  /** Left edge of the text block. */
  left: number;
  /** Length of the accent bar. */
  width: number;
}

function layout(input: StyleRenderInput<BigNumberSettings>): Layout {
  const { content, settings, ground } = input;
  const { metric } = content;
  const counts = !!metric && Number.isFinite(metric.value);
  const title = (content.title ?? '').trim();

  const finalNumber = counts
    ? settings.prefix + formatNumber(metric.value, { decimals: decimalPlaces(metric.value) })
    : title;
  const unit = counts ? (metric.unit ?? '').trim() : '';
  const label = (counts ? (metric.label?.trim() || title) : (content.subtitle ?? '').trim()).toUpperCase();

  // Measured on the finished (widest) number so the block never resizes mid-count.
  const numberWidth = finalNumber
    ? measureTextWidth(finalNumber, NUMBER_SIZE, ANNOTATION_FONTS.condensed, NUMBER_WEIGHT, NUMBER_SPACING)
    : 0;
  const unitWidth = unit ? UNIT_GAP + measureTextWidth(unit, UNIT_SIZE, ANNOTATION_FONTS.condensed, UNIT_WEIGHT) : 0;
  const labelWidth = label
    ? measureTextWidth(label, LABEL_SIZE, ANNOTATION_FONTS.condensed, LABEL_WEIGHT, LABEL_SPACING)
    : 0;
  const width = Math.ceil(Math.max(numberWidth + unitWidth, labelWidth, MIN_WIDTH));
  const direction = resolveDirection(settings.side, ground.x);

  return {
    direction,
    finalNumber,
    counts,
    unit,
    label,
    numberWidth,
    left: direction === 1 ? 0 : -width,
    width,
  };
}

// ─── Render ───────────────────────────────────────────────────────────────────

export function renderBigNumber(input: StyleRenderInput<BigNumberSettings>): SceneNode {
  const { content, settings, ground, phase, phaseProgress } = input;
  const { finalNumber, counts, unit, label, numberWidth, left, width } = layout(input);
  const { accentColor, textColor } = settings;
  const build = buildProgress(phase, phaseProgress);
  const shadow = settings.halo ? HALO_SHADOW : undefined;

  const dot = stage(build, ...DOT_WINDOW, easeOutBack);
  const leader = stage(build, ...LINE_WINDOW, easeInOutCubic);
  const count = stage(build, ...COUNT_WINDOW, easeOutCubic);
  const numberFade = stage(build, ...NUMBER_FADE_WINDOW);
  const settle = stage(build, ...SETTLE_WINDOW, easeOutBack);
  const labelReveal = stage(build, ...LABEL_WINDOW, easeOutCubic);

  const children: SceneNode[] = [];

  if (leader > 0) {
    children.push(polyline({
      points: [[ground.x, ground.y], [0, 0]],
      progress: leader,
      stroke: textColor,
      strokeWidth: LINE_WIDTH,
      lineCap: 'round',
      shadow,
    }));
  }

  if (dot > 0) {
    children.push(group({
      x: ground.x,
      y: ground.y,
      scale: dot,
      children: [
        circle({ cx: 0, cy: 0, r: RING_RADIUS, stroke: accentColor, strokeWidth: 1, opacity: 0.7, shadow }),
        circle({ cx: 0, cy: 0, r: DOT_RADIUS, fill: accentColor, stroke: textColor, strokeWidth: 1, shadow }),
      ],
    }));
  }

  // The bar grows in step with the count.
  if (count > 0) {
    children.push(polyline({
      points: [[left, 0], [left + width, 0]],
      progress: count,
      stroke: accentColor,
      strokeWidth: BAR_WIDTH,
      lineCap: 'butt',
      shadow,
    }));
  }

  if (finalNumber && numberFade > 0) {
    const shown = counts ? settings.prefix + formatCountUp(content.metric!.value, count) : finalNumber;
    const drop = (1 - settle) * SETTLE_DROP;
    children.push(text({
      x: left,
      y: NUMBER_BASELINE + drop,
      text: shown,
      fontSize: NUMBER_SIZE,
      fontFamily: ANNOTATION_FONTS.condensed,
      fontWeight: NUMBER_WEIGHT,
      letterSpacing: NUMBER_SPACING,
      fill: textColor,
      align: 'left',
      baseline: 'alphabetic',
      opacity: numberFade,
      shadow,
    }));

    if (unit) {
      children.push(text({
        x: left + numberWidth + UNIT_GAP,
        y: NUMBER_BASELINE - UNIT_RAISE + drop,
        text: unit,
        fontSize: UNIT_SIZE,
        fontFamily: ANNOTATION_FONTS.condensed,
        fontWeight: UNIT_WEIGHT,
        fill: accentColor,
        align: 'left',
        baseline: 'alphabetic',
        opacity: numberFade,
        shadow,
      }));
    }
  }

  if (label && labelReveal > 0) {
    children.push(text({
      x: left - (1 - labelReveal) * LABEL_SLIDE,
      y: LABEL_GAP,
      text: label,
      fontSize: LABEL_SIZE,
      fontFamily: ANNOTATION_FONTS.condensed,
      fontWeight: LABEL_WEIGHT,
      letterSpacing: LABEL_SPACING,
      fill: textColor,
      align: 'left',
      baseline: 'top',
      opacity: labelReveal * 0.9,
      shadow,
    }));
  }

  return group({ children });
}

// ─── Measure ──────────────────────────────────────────────────────────────────

/** Bounds of the finished state, with room for the label's slide and the number's settle. */
export function measureBigNumber(input: StyleRenderInput<BigNumberSettings>): StyleBounds {
  const finished = renderBigNumber({ ...input, phase: 'visible', phaseProgress: 1 });
  const { left, width } = layout(input);
  const slack = rect({
    x: left - LABEL_SLIDE,
    y: NUMBER_BASELINE - NUMBER_SIZE,
    width: width + LABEL_SLIDE * 2,
    height: NUMBER_SIZE + LABEL_GAP + LABEL_SIZE * 1.3 + SETTLE_DROP,
  });
  const box = measureScene(group({ children: [finished, slack] }));
  return { x: box.minX, y: box.minY, width: box.width, height: box.height };
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export const bigNumberStyle: AnnotationStyleDefinition<BigNumberSettings> = {
  id: 'big-number',
  version: 1,
  name: 'Big Number',
  description: 'A huge figure that counts up over an accent bar, with unit and label',
  category: 'data',
  icon: 'trending-up',
  contentSlots: ['metric', 'title', 'subtitle'],
  settingsSchema: bigNumberSettingsSchema,
  defaultSettings: defaultBigNumberSettings,
  supportsAltitude: true,
  defaultAltitude: 0,
  defaultOffset: [60, -80],
  drawsConnector: true,
  defaultConnector: { visible: false },
  defaultTransition: {
    enter: 'auto',
    exit: 'auto',
    enterDuration: 1.8,
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
    { type: 'text-input', key: 'prefix', label: 'Prefix', placeholder: '$' },
  ],
  render: renderBigNumber,
  measure: measureBigNumber,
};

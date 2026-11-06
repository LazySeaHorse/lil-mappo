import { z } from 'zod';
import type { AnnotationStyleDefinition, SceneNode, StyleBounds, StyleRenderInput } from '../types';
import { ANNOTATION_FONTS } from '../fonts';
import { buildProgress, easeInOutCubic, easeOutCubic, stage, staggered } from '../motion';
import { group, polyline, text } from '../scene/primitives';
import { boundsOf, HALO_CONTROL, haloSchema, haloShadow } from './shared';

// ─── Settings Schema ──────────────────────────────────────────────────────────

const POSITIONS = ['right', 'left', 'top'] as const;
const ORDERS = ['first', 'last'] as const;

export const poleLabelSettingsSchema = z.object({
  lineColor: z.string().default('#FFFFFF'),
  textColor: z.string().default('#FFFFFF'),
  /** Where the text sits: beside the pole, or above it. */
  position: z.enum(POSITIONS).default('right'),
  /** Whether the title comes first, with the small lines under it, or last, under them. */
  titleOrder: z.enum(ORDERS).default('first'),
  halo: haloSchema,
  /** Height of the pole in pixels. */
  height: z.number().default(120),
});

export type PoleLabelSettings = z.infer<typeof poleLabelSettingsSchema>;

export const defaultPoleLabelSettings: PoleLabelSettings = poleLabelSettingsSchema.parse({});

// ─── Layout Constants ─────────────────────────────────────────────────────────

const FONT = ANNOTATION_FONTS.body;
const TITLE_SIZE = 28;
const TITLE_WEIGHT = 700;
const DETAIL_SIZE = 15;
const DETAIL_WEIGHT = 500;
const DETAIL_OPACITY = 0.9;
const LINE_GAP = 4;
const LINE_WIDTH = 2;
/** Space between the pole and text beside it, or between the pole's top and text above it. */
const TEXT_GAP = 10;
/** How far a line slides into place as it appears. */
const TRAVEL = 10;

/** The pole draws up first, then the lines appear one after another. */
const POLE_WINDOW = [0, 0.5] as const;
const TEXT_WINDOW = [0.4, 1] as const;

// ─── Layout ───────────────────────────────────────────────────────────────────

interface Line {
  text: string;
  fontSize: number;
  fontWeight: number;
  opacity: number;
}

interface Layout {
  lines: Line[];
  blockHeight: number;
}

function layout(input: StyleRenderInput<PoleLabelSettings>): Layout {
  const { content, settings } = input;
  const title = (content.title ?? '').trim();
  const body = (content.body ?? '').trim();
  const subtitle = (content.subtitle ?? '').trim();

  const lines: Line[] = [];
  if (title) lines.push({ text: title, fontSize: TITLE_SIZE, fontWeight: TITLE_WEIGHT, opacity: 1 });
  for (const detail of [body, subtitle]) {
    if (detail) lines.push({ text: detail, fontSize: DETAIL_SIZE, fontWeight: DETAIL_WEIGHT, opacity: DETAIL_OPACITY });
  }
  if (settings.titleOrder === 'last') lines.reverse();

  const blockHeight = lines.reduce((sum, line) => sum + line.fontSize, 0) + LINE_GAP * Math.max(0, lines.length - 1);
  return { lines, blockHeight };
}

// ─── Render ───────────────────────────────────────────────────────────────────

export function renderPoleLabel(input: StyleRenderInput<PoleLabelSettings>): SceneNode {
  const { settings, phase, phaseProgress } = input;
  const { lines, blockHeight } = layout(input);
  const build = buildProgress(phase, phaseProgress);
  const shadow = haloShadow(settings.halo);
  const { position, height } = settings;

  const pole = stage(build, ...POLE_WINDOW, easeInOutCubic);
  const reveal = stage(build, ...TEXT_WINDOW);
  const children: SceneNode[] = [];

  if (pole > 0) {
    children.push(polyline({
      points: [[0, 0], [0, -height]],
      progress: pole,
      stroke: settings.lineColor,
      strokeWidth: LINE_WIDTH,
      lineCap: 'round',
      shadow,
    }));
  }

  // Beside the pole the block hangs from its top; above it the block stands on it.
  const direction = position === 'left' ? -1 : 1;
  const x = position === 'top' ? 0 : direction * (LINE_WIDTH / 2 + TEXT_GAP);
  const align = position === 'top' ? 'center' : direction === 1 ? 'left' : 'right';
  let y = position === 'top' ? -height - TEXT_GAP - blockHeight : -height;

  lines.forEach((line, index) => {
    const shown = staggered(reveal, index, lines.length, 0.5, easeOutCubic);
    if (shown > 0) {
      const slide = (1 - shown) * TRAVEL;
      children.push(text({
        x: position === 'top' ? x : x + direction * -slide,
        y: position === 'top' ? y + slide : y,
        text: line.text,
        fontSize: line.fontSize,
        fontFamily: FONT,
        fontWeight: line.fontWeight,
        fill: settings.textColor,
        align,
        baseline: 'top',
        opacity: shown * line.opacity,
        shadow,
      }));
    }
    y += line.fontSize + LINE_GAP;
  });

  return group({ children });
}

// ─── Measure ──────────────────────────────────────────────────────────────────

/** Bounds of the finished state: the lines only slide in from inside it. */
export function measurePoleLabel(input: StyleRenderInput<PoleLabelSettings>): StyleBounds {
  return boundsOf(renderPoleLabel({ ...input, phase: 'visible', phaseProgress: 1 }));
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export const poleLabelStyle: AnnotationStyleDefinition<PoleLabelSettings> = {
  id: 'pole-label',
  version: 1,
  name: 'Pole Label',
  description: 'A thin pole rising from the point with a title and two small lines beside or above it',
  category: 'label',
  icon: 'flag-triangle-right',
  contentSlots: ['title', 'body', 'subtitle'],
  settingsSchema: poleLabelSettingsSchema,
  defaultSettings: defaultPoleLabelSettings,
  supportsAltitude: false,
  defaultAltitude: 0,
  defaultOffset: [0, 0],
  defaultAnchor: 'bottom',
  drawsConnector: false,
  defaultConnector: { visible: false },
  defaultTransition: {
    enter: 'auto',
    exit: 'auto',
    enterDuration: 1,
    exitDuration: 0.5,
  },
  controls: [
    { type: 'color', key: 'lineColor', label: 'Pole color', role: 'accent' },
    { type: 'color', key: 'textColor', label: 'Text color' },
    {
      type: 'tabs',
      key: 'position',
      label: 'Text',
      options: [{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }, { value: 'top', label: 'Top' }],
    },
    {
      type: 'tabs',
      key: 'titleOrder',
      label: 'Title',
      options: [{ value: 'first', label: 'First' }, { value: 'last', label: 'Last' }],
    },
    HALO_CONTROL,
    { type: 'slider', key: 'height', label: 'Pole height', min: 60, max: 300, step: 10, unit: 'px' },
  ],
  render: renderPoleLabel,
  measure: measurePoleLabel,
};

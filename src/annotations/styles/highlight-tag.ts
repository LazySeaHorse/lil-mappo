import { z } from 'zod';
import type { AnnotationStyleDefinition, SceneNode, ShadowConfig, StyleBounds, StyleRenderInput } from '../types';
import { ANNOTATION_FONTS } from '../fonts';
import { buildProgress, easeInOutCubic, easeOutCubic, stage } from '../motion';
import { group, rect, text } from '../scene/primitives';
import { measureTextWidth } from '../scene/textMetrics';
import { boundsOf, haloSchema } from './shared';

// ─── Settings Schema ──────────────────────────────────────────────────────────

export const highlightTagSettingsSchema = z.object({
  boxColor: z.string().default('#FFE600'),
  textColor: z.string().default('#1A1A1A'),
  /** Lifts the boxes off the map with a soft drop shadow. */
  halo: haloSchema,
});

export type HighlightTagSettings = z.infer<typeof highlightTagSettingsSchema>;

export const defaultHighlightTagSettings: HighlightTagSettings = highlightTagSettingsSchema.parse({});

// ─── Layout Constants ─────────────────────────────────────────────────────────

const FONT = ANNOTATION_FONTS.body;
const TITLE_SIZE = 30;
const TITLE_WEIGHT = 800;
const SUBTITLE_SIZE = 16;
const SUBTITLE_WEIGHT = 700;
const TITLE_PAD_X = 16;
const TITLE_PAD_Y = 8;
const SUBTITLE_PAD_X = 12;
const SUBTITLE_PAD_Y = 5;
const MIN_TITLE_WIDTH = 64;
/** Space between the title box and the subtitle box under it. */
const ROW_GAP = 4;
/** How far text rises into its box while it settles. */
const TEXT_RISE = 0.7;

const BOX_SHADOW: ShadowConfig = { color: 'rgba(0, 0, 0, 0.35)', blur: 10, offsetX: 0, offsetY: 3 };

/** Entrance timeline, as overlapping windows of the 0–1 build progress. */
const TITLE_BOX_WINDOW = [0, 0.5] as const;
const TITLE_TEXT_WINDOW = [0.28, 0.66] as const;
const SUBTITLE_BOX_WINDOW = [0.5, 0.86] as const;
const SUBTITLE_TEXT_WINDOW = [0.64, 1] as const;

// ─── Layout ───────────────────────────────────────────────────────────────────

interface RowStyle {
  fontSize: number;
  fontWeight: number;
  padX: number;
  padY: number;
  minWidth: number;
  /** The box fills with the tag color (the title) or the text color (the subtitle). */
  filled: 'box' | 'text';
  boxWindow: readonly [number, number];
  textWindow: readonly [number, number];
}

const TITLE_ROW: RowStyle = {
  fontSize: TITLE_SIZE, fontWeight: TITLE_WEIGHT, padX: TITLE_PAD_X, padY: TITLE_PAD_Y, minWidth: MIN_TITLE_WIDTH,
  filled: 'box', boxWindow: TITLE_BOX_WINDOW, textWindow: TITLE_TEXT_WINDOW,
};
const SUBTITLE_ROW: RowStyle = {
  fontSize: SUBTITLE_SIZE, fontWeight: SUBTITLE_WEIGHT, padX: SUBTITLE_PAD_X, padY: SUBTITLE_PAD_Y, minWidth: 0,
  filled: 'text', boxWindow: SUBTITLE_BOX_WINDOW, textWindow: SUBTITLE_TEXT_WINDOW,
};

interface Row extends RowStyle {
  label: string;
  width: number;
  height: number;
  /** Top of the box, relative to the origin. */
  y: number;
}

interface Layout {
  rows: Row[];
  /** Left edge of the stack, relative to the origin. */
  left: number;
}

function layout(input: StyleRenderInput<HighlightTagSettings>): Layout {
  const title = (input.content.title ?? '').trim();
  const subtitle = (input.content.subtitle ?? '').trim();

  const sized = ([[title, TITLE_ROW], [subtitle, SUBTITLE_ROW]] as const)
    .filter(([label]) => label !== '')
    .map(([label, row]) => ({
      ...row,
      label,
      width: Math.max(Math.ceil(measureTextWidth(label, row.fontSize, FONT, row.fontWeight)) + row.padX * 2, row.minWidth),
      height: Math.round(row.fontSize * 1.1) + row.padY * 2,
    }));

  // The stack is centred on the origin, its boxes aligned on the left.
  const stackHeight = sized.reduce((sum, row) => sum + row.height, 0) + Math.max(0, sized.length - 1) * ROW_GAP;
  const stackWidth = Math.max(0, ...sized.map((row) => row.width));
  let y = -stackHeight / 2;
  const rows = sized.map((row) => {
    const placed: Row = { ...row, y };
    y += row.height + ROW_GAP;
    return placed;
  });
  return { rows, left: -stackWidth / 2 };
}

// ─── Render ───────────────────────────────────────────────────────────────────

export function renderHighlightTag(input: StyleRenderInput<HighlightTagSettings>): SceneNode {
  const { settings, phase, phaseProgress } = input;
  const { rows, left } = layout(input);
  const build = buildProgress(phase, phaseProgress);
  const shadow = settings.halo ? BOX_SHADOW : undefined;

  const children: SceneNode[] = [];
  for (const row of rows) {
    const wipe = stage(build, ...row.boxWindow, easeInOutCubic);
    if (wipe <= 0) continue;
    const reveal = stage(build, ...row.textWindow, easeOutCubic);
    const boxColor = row.filled === 'box' ? settings.boxColor : settings.textColor;
    const labelColor = row.filled === 'box' ? settings.textColor : settings.boxColor;
    const width = row.width * wipe;

    // The box is wiped open from its left edge. The label sits in a group
    // clipped to the open part, so it is revealed with the box and rises into
    // place from below the box's bottom edge.
    children.push(rect({ x: left, y: row.y, width, height: row.height, fill: boxColor, shadow }));
    if (reveal > 0) {
      children.push(group({
        clip: { x: left, y: row.y, width, height: row.height },
        children: [
          text({
            x: left + row.padX,
            y: row.y + row.height / 2 + (1 - reveal) * row.height * TEXT_RISE,
            text: row.label,
            fontSize: row.fontSize,
            fontFamily: FONT,
            fontWeight: row.fontWeight,
            fill: labelColor,
            align: 'left',
            baseline: 'middle',
          }),
        ],
      }));
    }
  }
  return group({ children });
}

// ─── Measure ──────────────────────────────────────────────────────────────────

/** Bounds of the finished tag: the stack of boxes, with room for their shadow when it is on. */
export function measureHighlightTag(input: StyleRenderInput<HighlightTagSettings>): StyleBounds {
  const { rows, left } = layout(input);
  const finished = renderHighlightTag({ ...input, phase: 'visible', phaseProgress: 1 });
  const reach = input.settings.halo ? BOX_SHADOW.blur : 0;
  const extent = rows.map((row) => rect({
    x: left - reach,
    y: row.y - reach,
    width: row.width + reach * 2,
    height: row.height + reach * 2 + (reach ? (BOX_SHADOW.offsetY ?? 0) : 0),
  }));
  return boundsOf(finished, ...extent);
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export const highlightTagStyle: AnnotationStyleDefinition<HighlightTagSettings> = {
  id: 'highlight-tag',
  version: 1,
  name: 'Highlight Tag',
  description: 'A bold name in a highlighter-yellow box that wipes open on the point',
  category: 'label',
  icon: 'tag',
  contentSlots: ['title', 'subtitle'],
  settingsSchema: highlightTagSettingsSchema,
  defaultSettings: defaultHighlightTagSettings,
  supportsAltitude: false,
  defaultAltitude: 0,
  defaultOffset: [0, 0],
  defaultAnchor: 'center',
  defaultTransition: {
    enter: 'auto',
    exit: 'auto',
    enterDuration: 1,
    exitDuration: 0.5,
  },
  controls: [
    { type: 'color', key: 'boxColor', label: 'Box color', role: 'accent' },
    { type: 'color', key: 'textColor', label: 'Text color' },
    { type: 'switch', key: 'halo', label: 'Soft shadow' },
  ],
  render: renderHighlightTag,
  measure: measureHighlightTag,
};

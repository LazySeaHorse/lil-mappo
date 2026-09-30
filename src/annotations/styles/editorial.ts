import { z } from 'zod';
import type { AnnotationStyleDefinition, SceneNode, StyleBounds, StyleRenderInput } from '../types';
import { ANNOTATION_FONTS } from '../fonts';
import { buildProgress, easeInOutCubic, easeOutBack, easeOutCubic, linear, stage, staggered } from '../motion';
import { wrapText, type TextSpec } from '../scene/glyphs';
import { group, polyline, rect, text } from '../scene/primitives';
import { measureTextWidth } from '../scene/textMetrics';
import { boundsOf, groundDot, haloShadow, leaderLine, resolveDirection } from './shared';

// ─── Settings Schema ──────────────────────────────────────────────────────────

export const editorialSettingsSchema = z.object({
  accentColor: z.string().default('#F2C14E'),
  textColor: z.string().default('#FFFFFF'),
  halo: z.boolean().default(true),
  side: z.enum(['auto', 'left', 'right']).default('auto'),
  maxWidth: z.number().default(220),
});

export type EditorialSettings = z.infer<typeof editorialSettingsSchema>;

export const defaultEditorialSettings: EditorialSettings = {
  accentColor: '#F2C14E',
  textColor: '#FFFFFF',
  halo: true,
  side: 'auto',
  maxWidth: 220,
};

// ─── Layout Constants ─────────────────────────────────────────────────────────

const EYEBROW: TextSpec = {
  fontSize: 11,
  fontFamily: ANNOTATION_FONTS.condensed,
  fontWeight: 600,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
};
const EYEBROW_LINE = 14;
const TITLE: TextSpec = { fontSize: 24, fontFamily: ANNOTATION_FONTS.serif, fontWeight: 600 };
const TITLE_LINE = 28;
const BODY: TextSpec = { fontSize: 13, fontFamily: ANNOTATION_FONTS.body, fontWeight: 400 };
const BODY_LINE = 18;
const BODY_OPACITY = 0.85;
const EYEBROW_GAP = 4;
const BODY_GAP = 8;

/** Space between the vertical rule and the text. */
const RULE_GAP = 12;
const RULE_WIDTH = 2;
const LINE_WIDTH = 1.25;
/** How far a line of text rises while it fades in. */
const ROW_RISE = 8;

/** Windows of the 0–1 build progress: dot, line, rule, then the text lines. */
const DOT_WINDOW = [0, 0.2] as const;
const LINE_WINDOW = [0.08, 0.4] as const;
const RULE_WINDOW = [0.32, 0.62] as const;
const TEXT_WINDOW = [0.5, 1] as const;
const ROW_SPREAD = 0.65;

// ─── Layout ───────────────────────────────────────────────────────────────────

interface Row {
  kind: 'eyebrow' | 'title' | 'body';
  value: string;
  /** Distance from the top of the text block. */
  top: number;
}

interface Layout {
  direction: 1 | -1;
  rows: Row[];
  /** Height of the whole text block, and so of the rule. */
  height: number;
  /** Width of the widest line. */
  width: number;
  /** True when the block sits above the origin (the point is below it). */
  above: boolean;
}

function layout(input: StyleRenderInput<EditorialSettings>): Layout {
  const { content, settings, ground } = input;
  const eyebrow = (content.eyebrow ?? '').trim();
  const title = (content.title ?? '').trim();
  const body = (content.body ?? '').trim();
  const maxWidth = Math.max(60, settings.maxWidth);

  const rows: Row[] = [];
  let top = 0;
  if (eyebrow) {
    rows.push({ kind: 'eyebrow', value: eyebrow, top });
    top += EYEBROW_LINE + EYEBROW_GAP;
  }
  if (title) {
    for (const value of wrapText(title, maxWidth, TITLE)) {
      rows.push({ kind: 'title', value, top });
      top += TITLE_LINE;
    }
  }
  if (body) {
    top += title || eyebrow ? BODY_GAP : 0;
    for (const value of wrapText(body, maxWidth, BODY)) {
      rows.push({ kind: 'body', value, top });
      top += BODY_LINE;
    }
  }

  const width = Math.max(0, ...rows.map((row) => {
    const spec = row.kind === 'eyebrow' ? EYEBROW : row.kind === 'title' ? TITLE : BODY;
    return measureTextWidth(row.kind === 'eyebrow' ? row.value.toUpperCase() : row.value, spec.fontSize, spec.fontFamily, spec.fontWeight, spec.letterSpacing);
  }));

  return { direction: resolveDirection(settings.side, ground.x), rows, height: top, width, above: ground.y >= 0 };
}

const specOf = (row: Row): TextSpec => (row.kind === 'eyebrow' ? EYEBROW : row.kind === 'title' ? TITLE : BODY);

// ─── Render ───────────────────────────────────────────────────────────────────

export function renderEditorial(input: StyleRenderInput<EditorialSettings>): SceneNode {
  const { settings, ground, phase, phaseProgress } = input;
  const { direction, rows, height, above } = layout(input);
  const { accentColor, textColor } = settings;
  const build = buildProgress(phase, phaseProgress);
  const shadow = haloShadow(settings.halo);

  const dot = stage(build, ...DOT_WINDOW, easeOutBack);
  const leader = stage(build, ...LINE_WINDOW, easeInOutCubic);
  const rule = stage(build, ...RULE_WINDOW, easeInOutCubic);
  const textBuild = stage(build, ...TEXT_WINDOW, linear);

  // The block sits above the origin when the point is below it, else beneath.
  const blockTop = above ? -height : 0;
  const children: SceneNode[] = [];

  if (leader > 0) {
    children.push(leaderLine(ground, [0, 0], { stroke: textColor, strokeWidth: LINE_WIDTH, progress: leader, shadow }));
  }

  if (rule > 0 && height > 0) {
    // Grows away from where the leader line joins it.
    children.push(polyline({
      points: above ? [[0, 0], [0, -height]] : [[0, 0], [0, height]],
      progress: rule,
      stroke: accentColor,
      strokeWidth: RULE_WIDTH,
      lineCap: 'butt',
      shadow,
    }));
  }

  if (dot > 0) {
    children.push(groundDot(ground, dot, { fill: accentColor, stroke: textColor, shadow }));
  }

  rows.forEach((row, index) => {
    const reveal = staggered(textBuild, index, rows.length, ROW_SPREAD, easeOutCubic);
    if (reveal <= 0) return;
    const spec = specOf(row);
    children.push(text({
      x: direction * RULE_GAP,
      y: blockTop + row.top + (1 - reveal) * ROW_RISE,
      text: row.value,
      fontSize: spec.fontSize,
      fontFamily: spec.fontFamily,
      fontWeight: spec.fontWeight,
      letterSpacing: spec.letterSpacing,
      textTransform: spec.textTransform,
      fill: row.kind === 'eyebrow' ? accentColor : textColor,
      align: direction === 1 ? 'left' : 'right',
      baseline: 'top',
      opacity: reveal * (row.kind === 'body' ? BODY_OPACITY : 1),
      shadow,
    }));
  });

  return group({ children });
}

// ─── Measure ──────────────────────────────────────────────────────────────────

/** Bounds of the finished state, with room for the lines' rise while they arrive. */
export function measureEditorial(input: StyleRenderInput<EditorialSettings>): StyleBounds {
  const finished = renderEditorial({ ...input, phase: 'visible', phaseProgress: 1 });
  const { direction, height, width, above } = layout(input);
  const blockTop = above ? -height : 0;
  const reach = RULE_GAP + width;
  const extent = height > 0
    ? [rect({
        x: direction === 1 ? 0 : -reach,
        y: blockTop,
        width: reach,
        height: height + ROW_RISE,
      })]
    : [];
  return boundsOf(finished, ...extent);
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export const editorialStyle: AnnotationStyleDefinition<EditorialSettings> = {
  id: 'editorial',
  version: 1,
  name: 'Editorial',
  description: 'A vertical rule beside a tracked eyebrow, a serif headline and body text',
  category: 'editorial',
  icon: 'newspaper',
  contentSlots: ['eyebrow', 'title', 'body'],
  settingsSchema: editorialSettingsSchema,
  defaultSettings: defaultEditorialSettings,
  supportsAltitude: true,
  defaultAltitude: 0,
  defaultOffset: [50, -60],
  drawsConnector: true,
  defaultConnector: { visible: false },
  defaultTransition: {
    enter: 'auto',
    exit: 'auto',
    enterDuration: 1.4,
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
    { type: 'slider', key: 'maxWidth', label: 'Text width', min: 140, max: 360, step: 10, unit: 'px' },
  ],
  render: renderEditorial,
  measure: measureEditorial,
};

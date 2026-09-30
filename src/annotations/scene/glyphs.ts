/**
 * Per-glyph text layout, for styles that animate letters individually:
 * staggered fades and rises, typing with a caret, scramble-then-resolve, and
 * text set along a circular arc. Positions come from the same text metrics the
 * renderer and measure use, so glyphs land exactly where whole-string text
 * would put them.
 */

import type { GroupNode, TextNode } from '../types';
import { hash01 } from '../random';
import { group, text } from './primitives';
import { measureTextWidth } from './textMetrics';

/** The typographic fields of a TextNode that affect layout. */
export interface TextSpec {
  fontSize: number;
  fontFamily: string;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  letterSpacing?: string;
  textTransform?: 'uppercase' | 'lowercase' | 'none';
}

export interface Glyph {
  char: string;
  /** Index into the laid-out string (after textTransform). */
  index: number;
  /** Left edge, from the start of the text. */
  x: number;
  width: number;
}

export interface GlyphLayout {
  glyphs: Glyph[];
  /** Width of the whole string. */
  width: number;
}

export function applyTextTransform(value: string, transform: TextSpec['textTransform']): string {
  if (transform === 'uppercase') return value.toUpperCase();
  if (transform === 'lowercase') return value.toLowerCase();
  return value;
}

function measure(value: string, spec: TextSpec): number {
  return measureTextWidth(value, spec.fontSize, spec.fontFamily, spec.fontWeight ?? 400, spec.letterSpacing, spec.fontStyle);
}

/**
 * Places every character of `value`. A character's left edge is the measured
 * width of the text before it, so kerning and letter spacing are respected.
 */
export function layoutGlyphs(value: string, spec: TextSpec): GlyphLayout {
  const display = applyTextTransform(value, spec.textTransform);
  const chars = Array.from(display);
  let prefix = '';
  let left = 0;
  const glyphs = chars.map((char, index) => {
    prefix += char;
    const right = measure(prefix, spec);
    const glyph: Glyph = { char, index, x: left, width: right - left };
    left = right;
    return glyph;
  });
  return { glyphs, width: left };
}

/** Offset to add to a left-aligned x so the laid-out text is aligned about it. */
export function alignOffset(width: number, align: 'left' | 'center' | 'right' = 'left'): number {
  return align === 'center' ? -width / 2 : align === 'right' ? -width : 0;
}

export interface GlyphTextProps extends TextSpec {
  x: number;
  y: number;
  /** Alignment of the whole string about x. Default 'left'. */
  align?: 'left' | 'center' | 'right';
  baseline?: TextNode['baseline'];
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  shadow?: TextNode['shadow'];
  opacity?: number;
}

/**
 * One left-aligned TextNode per visible glyph, positioned as the whole string
 * would be. `perGlyph` overrides or adds fields per glyph (opacity, y offset,
 * fill, ...); return `null` to leave a glyph out. Whitespace is skipped.
 */
export function glyphTexts(
  layout: GlyphLayout,
  props: GlyphTextProps,
  perGlyph?: (glyph: Glyph) => Partial<Omit<TextNode, 'type' | 'text'>> | null,
): TextNode[] {
  const { x, align, ...rest } = props;
  const origin = x + alignOffset(layout.width, align);
  const nodes: TextNode[] = [];
  for (const glyph of layout.glyphs) {
    if (!glyph.char.trim()) continue;
    const override = perGlyph ? perGlyph(glyph) : {};
    if (override === null) continue;
    nodes.push(text({
      ...rest,
      textTransform: undefined,
      x: origin + glyph.x,
      align: 'left',
      ...override,
      text: glyph.char,
    }));
  }
  return nodes;
}

// ─── Text on an arc ───────────────────────────────────────────────────────────

export interface ArcGlyph {
  char: string;
  /** Glyph centre. */
  x: number;
  y: number;
  /** Radians to rotate the glyph by so it stands on the arc. */
  rotation: number;
}

export interface ArcOptions {
  cx?: number;
  cy?: number;
  radius: number;
  /**
   * Angle of the middle of the text, radians clockwise from 3 o'clock (canvas
   * convention). -PI/2 is the top of the circle.
   */
  centerAngle: number;
  /**
   * 'cw' reads clockwise with letter tops pointing away from the centre: text
   * over the top of a ring. 'ccw' reads counter-clockwise with letter tops
   * pointing to the centre: text under the bottom of a ring, still left to
   * right. Default 'cw'.
   */
  direction?: 'cw' | 'ccw';
}

/** Places each glyph on a circle, so a style can draw it as a rotated group. */
export function layoutGlyphsOnArc(layout: GlyphLayout, options: ArcOptions): ArcGlyph[] {
  const { cx = 0, cy = 0, radius, centerAngle, direction = 'cw' } = options;
  const sign = direction === 'cw' ? 1 : -1;
  return layout.glyphs.map((glyph) => {
    const along = glyph.x + glyph.width / 2 - layout.width / 2;
    const angle = centerAngle + sign * (along / radius);
    return {
      char: glyph.char,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      rotation: angle + sign * (Math.PI / 2),
    };
  });
}

/**
 * Rotated groups, one per non-blank arc glyph, each holding a single centred
 * character drawn at the group origin. `perGlyph` may adjust the group or the
 * text node, e.g. to fade letters in one by one; return null to omit.
 */
export function arcGlyphGroups(
  glyphs: ArcGlyph[],
  textProps: Omit<TextNode, 'type' | 'text' | 'x' | 'y' | 'align'>,
  perGlyph?: (glyph: ArcGlyph, index: number) => { group?: Partial<GroupNode>; text?: Partial<TextNode> } | null,
): GroupNode[] {
  const groups: GroupNode[] = [];
  glyphs.forEach((glyph, index) => {
    if (!glyph.char.trim()) return;
    const override = perGlyph ? perGlyph(glyph, index) : {};
    if (override === null) return;
    groups.push(group({
      x: glyph.x,
      y: glyph.y,
      rotation: glyph.rotation,
      ...override.group,
      children: [
        text({
          baseline: 'middle',
          ...textProps,
          x: 0,
          y: 0,
          align: 'center',
          text: glyph.char,
          ...override.text,
        }),
      ],
    }));
  });
  return groups;
}

// ─── Typing and scrambling ────────────────────────────────────────────────────

/** How many characters of a `length`-long string are typed at 0–1 progress. */
export function typedCount(length: number, progress: number): number {
  return Math.min(length, Math.max(0, Math.floor(progress * length + 1e-9)));
}

/** A blinking caret: on for the first half of each period. */
export function caretVisible(time: number, period = 1): boolean {
  return ((time % period) + period) % period < period / 2;
}

const DIGITS = '0123456789';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';

export interface ScrambleOptions {
  /** Changes the random pattern, e.g. per callout. Default 0. */
  seed?: number;
  /** How many times per second unresolved characters change. Default 20. */
  rate?: number;
}

/**
 * Text that scrambles and resolves into `target` as `progress` goes 0 to 1.
 * Characters settle roughly left to right (with per-character jitter); until
 * then they show a random character of the same kind (digit, upper or lower
 * case letter). Spaces and punctuation never scramble. Fully deterministic in
 * (target, progress, time, seed), so preview and export agree; at progress 1
 * the result is exactly `target`.
 */
export function scrambleText(target: string, progress: number, time: number, options: ScrambleOptions = {}): string {
  const { seed = 0, rate = 20 } = options;
  const chars = Array.from(target);
  const tick = Math.floor(time * rate);
  return chars
    .map((char, index) => {
      const pool = DIGITS.includes(char) ? DIGITS : UPPER.includes(char) ? UPPER : LOWER.includes(char) ? LOWER : null;
      if (!pool) return char;
      const resolvesAt = (index / chars.length) * 0.7 + hash01(seed, index) * 0.3;
      if (progress >= resolvesAt) return char;
      return pool[Math.floor(hash01(seed, index, tick) * pool.length)];
    })
    .join('');
}

// ─── Wrapping ─────────────────────────────────────────────────────────────────

/**
 * Breaks text into lines no wider than `maxWidth`, at spaces (explicit newlines
 * are kept). A single word wider than the limit gets a line of its own. Styles
 * draw one TextNode per line.
 */
export function wrapText(value: string, maxWidth: number, spec: TextSpec): string[] {
  const lines: string[] = [];
  for (const paragraph of applyTextTransform(value, spec.textTransform).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate, spec) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

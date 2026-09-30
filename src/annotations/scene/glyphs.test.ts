import { describe, it, expect } from 'vitest';
import {
  alignOffset,
  arcGlyphGroups,
  caretVisible,
  glyphTexts,
  layoutGlyphs,
  layoutGlyphsOnArc,
  scrambleText,
  typedCount,
  wrapText,
  type TextSpec,
} from './glyphs';
import { measureTextWidth } from './textMetrics';

const SPEC: TextSpec = { fontSize: 20, fontFamily: 'Outfit', fontWeight: 600, letterSpacing: '0.1em' };

describe('layoutGlyphs', () => {
  it('lays characters out left to right and totals the measured width', () => {
    const layout = layoutGlyphs('Harbour', SPEC);
    expect(layout.glyphs.map((g) => g.char).join('')).toBe('Harbour');
    expect(layout.width).toBeCloseTo(measureTextWidth('Harbour', 20, 'Outfit', 600, '0.1em'));
    layout.glyphs.forEach((glyph, i) => {
      expect(glyph.index).toBe(i);
      expect(glyph.width).toBeGreaterThan(0);
      if (i > 0) expect(glyph.x).toBeCloseTo(layout.glyphs[i - 1].x + layout.glyphs[i - 1].width);
    });
    expect(layout.glyphs[0].x).toBe(0);
  });

  it('applies the text transform before laying out', () => {
    const layout = layoutGlyphs('Ab', { ...SPEC, textTransform: 'uppercase' });
    expect(layout.glyphs.map((g) => g.char)).toEqual(['A', 'B']);
    expect(layout.width).toBeCloseTo(measureTextWidth('AB', 20, 'Outfit', 600, '0.1em'));
  });

  it('is empty for an empty string', () => {
    expect(layoutGlyphs('', SPEC)).toEqual({ glyphs: [], width: 0 });
  });

  it('aligns about a point', () => {
    expect(alignOffset(100, 'left')).toBe(0);
    expect(alignOffset(100, 'center')).toBe(-50);
    expect(alignOffset(100, 'right')).toBe(-100);
  });
});

describe('glyphTexts', () => {
  const layout = layoutGlyphs('A B', SPEC);

  it('makes one left-aligned node per non-blank glyph, in the whole string position', () => {
    const nodes = glyphTexts(layout, { ...SPEC, x: 100, y: 5, align: 'center', fill: '#fff' });
    expect(nodes.map((n) => n.text)).toEqual(['A', 'B']);
    expect(nodes[0]).toMatchObject({ x: 100 - layout.width / 2, y: 5, align: 'left', fill: '#fff' });
    expect(nodes[1].x).toBeCloseTo(100 - layout.width / 2 + layout.glyphs[2].x);
  });

  it('lets a callback override per glyph or drop glyphs', () => {
    const nodes = glyphTexts(layout, { ...SPEC, x: 0, y: 0 }, (g) => (g.index === 0 ? null : { opacity: 0.5, y: -3 }));
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ text: 'B', opacity: 0.5, y: -3 });
  });

  it('does not transform again', () => {
    const upper = layoutGlyphs('ab', { ...SPEC, textTransform: 'uppercase' });
    expect(glyphTexts(upper, { ...SPEC, textTransform: 'uppercase', x: 0, y: 0 })[0].textTransform).toBeUndefined();
  });
});

describe('layoutGlyphsOnArc', () => {
  const layout = layoutGlyphs('ABC', { fontSize: 20, fontFamily: 'Outfit' });

  it('centres text over the top of a circle, upright at the middle', () => {
    const glyphs = layoutGlyphsOnArc(layout, { radius: 100, centerAngle: -Math.PI / 2 });
    const mid = glyphs[1];
    expect(mid.x).toBeCloseTo(0);
    expect(mid.y).toBeCloseTo(-100);
    expect(mid.rotation).toBeCloseTo(0);
    // Reads left to right, and the outer letters tilt away from upright.
    expect(glyphs[0].x).toBeLessThan(mid.x);
    expect(glyphs[2].x).toBeGreaterThan(mid.x);
    expect(glyphs[0].rotation).toBeLessThan(0);
    expect(glyphs[2].rotation).toBeGreaterThan(0);
  });

  it('keeps every glyph on the circle', () => {
    for (const g of layoutGlyphsOnArc(layout, { cx: 10, cy: 20, radius: 80, centerAngle: 1 })) {
      expect(Math.hypot(g.x - 10, g.y - 20)).toBeCloseTo(80);
    }
  });

  it('reads left to right, upright, under the bottom of a circle when counter-clockwise', () => {
    const glyphs = layoutGlyphsOnArc(layout, { radius: 100, centerAngle: Math.PI / 2, direction: 'ccw' });
    expect(glyphs[1].y).toBeCloseTo(100);
    expect(glyphs[1].rotation).toBeCloseTo(0);
    expect(glyphs[0].x).toBeLessThan(glyphs[2].x);
  });

  it('turns the glyphs into rotated, centred single-character groups', () => {
    const arc = layoutGlyphsOnArc(layoutGlyphs('A B', { fontSize: 20, fontFamily: 'Outfit' }), { radius: 50, centerAngle: 0 });
    const groups = arcGlyphGroups(arc, { fontSize: 20, fontFamily: 'Outfit', fill: '#fff' }, (_, i) => (i === 2 ? { group: { opacity: 0.4 } } : {}));
    expect(groups).toHaveLength(2); // the space is skipped
    expect(groups[0]).toMatchObject({ x: arc[0].x, y: arc[0].y, rotation: arc[0].rotation });
    expect(groups[0].children[0]).toMatchObject({ text: 'A', x: 0, y: 0, align: 'center', baseline: 'middle', fill: '#fff' });
    expect(groups[1].opacity).toBe(0.4);
  });
});

describe('typing', () => {
  it('reveals characters in step with progress and finishes exactly', () => {
    expect(typedCount(10, 0)).toBe(0);
    expect(typedCount(10, 0.35)).toBe(3);
    expect(typedCount(10, 0.7)).toBe(7);
    expect(typedCount(10, 1)).toBe(10);
    expect(typedCount(10, 2)).toBe(10);
    expect(typedCount(3, 1 / 3)).toBe(1);
  });

  it('blinks the caret', () => {
    expect(caretVisible(0)).toBe(true);
    expect(caretVisible(0.49)).toBe(true);
    expect(caretVisible(0.5)).toBe(false);
    expect(caretVisible(1)).toBe(true);
    expect(caretVisible(0.3, 0.4)).toBe(false);
  });
});

describe('scrambleText', () => {
  const target = 'Lat 48.85, Ok';

  it('resolves exactly to the target at progress 1', () => {
    for (const time of [0, 0.37, 12]) expect(scrambleText(target, 1, time)).toBe(target);
  });

  it('is deterministic in target, progress, time and seed', () => {
    expect(scrambleText(target, 0.4, 1.23, { seed: 3 })).toBe(scrambleText(target, 0.4, 1.23, { seed: 3 }));
    expect(scrambleText(target, 0.4, 1.23, { seed: 3 })).not.toBe(scrambleText(target, 0.4, 1.23, { seed: 4 }));
  });

  it('keeps length, spaces and punctuation, and swaps like for like', () => {
    const out = scrambleText(target, 0, 0.5);
    expect(out).toHaveLength(target.length);
    Array.from(target).forEach((char, i) => {
      if (/[0-9]/.test(char)) expect(out[i]).toMatch(/[0-9]/);
      else if (/[A-Z]/.test(char)) expect(out[i]).toMatch(/[A-Z]/);
      else if (/[a-z]/.test(char)) expect(out[i]).toMatch(/[a-z]/);
      else expect(out[i]).toBe(char);
    });
  });

  it('changes over time while unresolved and settles progressively', () => {
    expect(scrambleText('ABCDEFGH', 0.2, 0)).not.toBe(scrambleText('ABCDEFGH', 0.2, 0.5));
    const settled = (p: number) => Array.from('ABCDEFGH').filter((c, i) => scrambleText('ABCDEFGH', p, 0.1)[i] === c).length;
    expect(settled(0.9)).toBeGreaterThanOrEqual(settled(0.5));
    expect(settled(0.5)).toBeGreaterThanOrEqual(settled(0.1));
  });
});

describe('wrapText', () => {
  const spec: TextSpec = { fontSize: 10, fontFamily: 'Outfit' }; // ~5.5px per character in tests

  it('wraps at spaces within the width', () => {
    const lines = wrapText('one two three four', 60, spec);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('one two three four');
    for (const line of lines) expect(measureTextWidth(line, 10, 'Outfit')).toBeLessThanOrEqual(60);
  });

  it('keeps explicit newlines and gives an over-long word its own line', () => {
    expect(wrapText('a\nb', 100, spec)).toEqual(['a', 'b']);
    expect(wrapText('short supercalifragilistic end', 40, spec)).toEqual(['short', 'supercalifragilistic', 'end']);
  });

  it('applies the transform and returns one empty line for empty text', () => {
    expect(wrapText('hi', 100, { ...spec, textTransform: 'uppercase' })).toEqual(['HI']);
    expect(wrapText('', 100, spec)).toEqual(['']);
  });
});

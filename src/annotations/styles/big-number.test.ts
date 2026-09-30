import { describe, it, expect } from 'vitest';
import type { GroupNode, PolylineNode, SceneNode, StyleRenderInput, TextNode } from '../types';
import {
  bigNumberSettingsSchema,
  bigNumberStyle,
  defaultBigNumberSettings,
  measureBigNumber,
  renderBigNumber,
  type BigNumberSettings,
} from './big-number';

const GROUND = { x: -60, y: 80 };
const METRIC = { value: 1234.5, unit: 'm', label: 'Bridge span' };

function makeInput(overrides: Partial<StyleRenderInput<BigNumberSettings>> = {}): StyleRenderInput<BigNumberSettings> {
  return {
    content: { title: 'Height', metric: METRIC },
    settings: { ...defaultBigNumberSettings },
    phase: 'visible',
    phaseProgress: 1,
    ground: GROUND,
    itemTime: 3,
    playheadTime: 3,
    pixelRatio: 1,
    ...overrides,
  };
}

const enter = (progress: number, overrides: Partial<StyleRenderInput<BigNumberSettings>> = {}) =>
  renderBigNumber(makeInput({ phase: 'enter', phaseProgress: progress, ...overrides }));

function flatten(node: SceneNode): SceneNode[] {
  return node.type === 'group' ? [node, ...node.children.flatMap(flatten)] : [node];
}
const texts = (scene: SceneNode) => flatten(scene).filter((n): n is TextNode => n.type === 'text');
const numberOf = (scene: SceneNode) => texts(scene).find((t) => t.fontSize === 56);
const unitOf = (scene: SceneNode) => texts(scene).find((t) => t.fontSize === 28);
const labelOf = (scene: SceneNode) => texts(scene).find((t) => t.fontSize === 12);
const bar = (scene: SceneNode) => flatten(scene).find((n): n is PolylineNode => n.type === 'polyline' && n.stroke === '#FF5A36');
const leader = (scene: SceneNode) => flatten(scene).find((n): n is PolylineNode => n.type === 'polyline' && n.stroke === '#FFFFFF');

describe('bigNumberStyle definition', () => {
  it('is a self-connecting data style using the metric slot', () => {
    expect(bigNumberStyle).toMatchObject({
      id: 'big-number',
      category: 'data',
      icon: 'trending-up',
      drawsConnector: true,
      defaultTransition: { enter: 'auto', exit: 'auto', enterDuration: 1.8 },
    });
    expect(bigNumberStyle.contentSlots).toContain('metric');
    expect(bigNumberStyle.controls.map((c) => c.key).sort()).toEqual(Object.keys(defaultBigNumberSettings).sort());
    expect(bigNumberStyle.controls.find((c) => c.key === 'prefix')?.type).toBe('text-input');
    expect(bigNumberSettingsSchema.parse({})).toEqual(defaultBigNumberSettings);
  });
});

describe('layout', () => {
  it('shows the formatted value in big condensed type with a raised unit and a label under the bar', () => {
    const scene = renderBigNumber(makeInput());
    expect(numberOf(scene)).toMatchObject({ text: '1,234.5', fontFamily: 'Barlow Condensed', fontWeight: 700, baseline: 'alphabetic' });
    expect(unitOf(scene)).toMatchObject({ text: 'm', fill: '#FF5A36' });
    expect(unitOf(scene)!.y).toBeLessThan(numberOf(scene)!.y);
    expect(unitOf(scene)!.x).toBeGreaterThan(numberOf(scene)!.x);
    expect(labelOf(scene)).toMatchObject({ text: 'BRIDGE SPAN', baseline: 'top' });
    expect(labelOf(scene)!.y).toBeGreaterThan(0);
  });

  it('uses the title as the label when the metric has none', () => {
    const scene = renderBigNumber(makeInput({ content: { title: 'Height', metric: { value: 5 } } }));
    expect(labelOf(scene)!.text).toBe('HEIGHT');
    expect(unitOf(scene)).toBeUndefined();
  });

  it('puts the prefix before the number', () => {
    const scene = renderBigNumber(makeInput({ settings: { ...defaultBigNumberSettings, prefix: '$' } }));
    expect(numberOf(scene)!.text).toBe('$1,234.5');
  });

  it('shows the title as the big text, without counting, when there is no metric', () => {
    const content = { title: 'Open 24/7', subtitle: 'All year' };
    const scene = renderBigNumber(makeInput({ content }));
    expect(numberOf(scene)!.text).toBe('Open 24/7');
    expect(labelOf(scene)!.text).toBe('ALL YEAR');
    expect(numberOf(enter(0.6, { content }))!.text).toBe('Open 24/7');
  });

  it('joins the ground point to the start of the bar, and mirrors for the left', () => {
    const right = renderBigNumber(makeInput());
    expect(leader(right)!.points).toEqual([[-60, 80], [0, 0]]);
    expect(bar(right)!.points[0][0]).toBe(0);
    expect(bar(right)!.points[1][0]).toBeGreaterThan(60);

    const left = renderBigNumber(makeInput({ ground: { x: 60, y: 80 } }));
    expect(bar(left)!.points[1][0]).toBe(0);
    expect(bar(left)!.points[0][0]).toBeLessThan(-60);
    expect(bar(left)!.points[0][0]).toBe(-bar(right)!.points[1][0]);
  });

  it('sizes the bar to the finished number, so it does not change mid-count', () => {
    const settled = bar(renderBigNumber(makeInput()))!;
    const counting = bar(enter(0.6))!;
    expect(counting.points).toEqual(settled.points);
    expect(counting.progress).toBeLessThan(1);
  });

  it('applies colours and the halo setting', () => {
    const scene = renderBigNumber(makeInput({ settings: { ...defaultBigNumberSettings, accentColor: '#00ff00', textColor: '#0000ff', halo: false } }));
    expect(numberOf(scene)!.fill).toBe('#0000ff');
    expect(bar(scene)).toBeUndefined();
    expect(flatten(scene).some((n) => 'shadow' in n && n.shadow)).toBe(false);
  });
});

describe('measure', () => {
  it('covers the ground point, the whole bar and the number, in every phase', () => {
    const b = measureBigNumber(makeInput());
    expect(b.x).toBeLessThanOrEqual(-60 - 8);
    expect(b.y + b.height).toBeGreaterThanOrEqual(80 + 8);
    expect(b.y).toBeLessThanOrEqual(-56);
    expect(measureBigNumber(makeInput({ phase: 'enter', phaseProgress: 0 }))).toEqual(b);
  });

  it('does not depend on the count: it is sized on the final number', () => {
    const small = measureBigNumber(makeInput({ content: { title: 'x', metric: { value: 1, unit: '' } } }));
    const big = measureBigNumber(makeInput({ content: { title: 'x', metric: { value: 1234567 } } }));
    expect(big.width).toBeGreaterThan(small.width);
  });
});

describe('entrance choreography', () => {
  it('draws nothing at progress 0 and the finished state at 1', () => {
    expect(enter(0)).toEqual({ type: 'group', children: [] });
    expect(enter(1)).toEqual(renderBigNumber(makeInput()));
  });

  it('pops the dot and draws the line before the number starts', () => {
    const early = enter(0.1);
    expect(flatten(early).some((n): n is GroupNode => n.type === 'group' && n.scale !== undefined)).toBe(true);
    expect(numberOf(early)).toBeUndefined();
    expect(leader(enter(0.2))!.progress).toBeGreaterThan(0);
    expect(numberOf(enter(0.2))).toBeUndefined();
  });

  it('counts up monotonically to the value with the bar growing in sync', () => {
    const value = (p: number) => Number(numberOf(enter(p))!.text.replace(/,/g, ''));
    const values = [0.32, 0.45, 0.6, 0.75, 0.9].map(value);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    expect(values[0]).toBeLessThan(1234.5);
    expect(values[values.length - 1]).toBe(1234.5);
    // One decimal throughout, so the digits do not jump width.
    expect(numberOf(enter(0.5))!.text).toMatch(/\.\d$/);

    const p = (t: number) => bar(enter(t))?.progress ?? 0;
    expect(p(0.5)).toBeGreaterThan(p(0.35));
    expect(p(0.5)).toBeLessThan(1);
    expect(p(0.9)).toBe(1);
  });

  it('settles the number up into place as the count lands, and brings the label in after it starts', () => {
    const settled = numberOf(renderBigNumber(makeInput()))!.y;
    expect(numberOf(enter(0.6))!.y).toBeGreaterThan(settled);
    expect(labelOf(enter(0.45))).toBeUndefined();
    const sliding = labelOf(enter(0.65))!;
    const rest = labelOf(renderBigNumber(makeInput()))!;
    expect(sliding.x).toBeLessThan(rest.x);
    expect(sliding.opacity!).toBeLessThan(rest.opacity!);
  });
});

describe('exit choreography', () => {
  it('plays the entrance in reverse', () => {
    for (const p of [0, 0.3, 0.7, 1]) {
      expect(renderBigNumber(makeInput({ phase: 'exit', phaseProgress: p }))).toEqual(enter(1 - p));
    }
  });
});

import { describe, it, expect } from 'vitest';
import type { CircleNode, PolylineNode, SceneNode, StyleRenderInput, TextNode } from '../types';
import {
  defaultEditorialSettings,
  editorialSettingsSchema,
  editorialStyle,
  measureEditorial,
  renderEditorial,
  resolveDirection,
  type EditorialSettings,
} from './editorial';
import { measureTextWidth } from '../scene/textMetrics';

const GROUND = { x: -50, y: 100 };
const BODY = 'Built across the harbour in 1932, it carried troops and supplies through the war years without a single closure.';

function makeInput(overrides: Partial<StyleRenderInput<EditorialSettings>> = {}): StyleRenderInput<EditorialSettings> {
  return {
    content: { eyebrow: '1943', title: 'The bridge that never fell', body: BODY },
    settings: { ...defaultEditorialSettings },
    phase: 'visible',
    phaseProgress: 1,
    ground: GROUND,
    itemTime: 3,
    playheadTime: 3,
    pixelRatio: 1,
    ...overrides,
  };
}

const enter = (progress: number, overrides: Partial<StyleRenderInput<EditorialSettings>> = {}) =>
  renderEditorial(makeInput({ phase: 'enter', phaseProgress: progress, ...overrides }));

function flatten(node: SceneNode): SceneNode[] {
  return node.type === 'group' ? [node, ...node.children.flatMap(flatten)] : [node];
}
const texts = (scene: SceneNode) => flatten(scene).filter((n): n is TextNode => n.type === 'text');
const lines = (scene: SceneNode) => flatten(scene).filter((n): n is PolylineNode => n.type === 'polyline');
const leaderOf = (scene: SceneNode) => lines(scene).find((l) => l.stroke === '#FFFFFF');
const ruleOf = (scene: SceneNode) => lines(scene).find((l) => l.stroke === '#F2C14E');
const kinds = (scene: SceneNode) => ({
  eyebrow: texts(scene).filter((t) => t.fontSize === 11),
  title: texts(scene).filter((t) => t.fontSize === 24),
  body: texts(scene).filter((t) => t.fontSize === 13),
});

describe('editorialStyle definition', () => {
  it('is an editorial style that draws its own leader', () => {
    expect(editorialStyle).toMatchObject({
      id: 'editorial',
      category: 'editorial',
      icon: 'newspaper',
      drawsConnector: true,
      contentSlots: ['eyebrow', 'title', 'body'],
      defaultTransition: { enter: 'auto', exit: 'auto', enterDuration: 1.4 },
    });
    expect(editorialStyle.controls.map((c) => c.key).sort()).toEqual(Object.keys(defaultEditorialSettings).sort());
    expect(editorialSettingsSchema.parse({})).toEqual(defaultEditorialSettings);
  });
});

describe('layout', () => {
  it('sets eyebrow in tracked condensed caps, title in serif, body in sans', () => {
    const { eyebrow, title, body } = kinds(renderEditorial(makeInput()));
    expect(eyebrow[0]).toMatchObject({ text: '1943', fontFamily: 'Barlow Condensed', fontWeight: 600, textTransform: 'uppercase', fill: '#F2C14E' });
    expect(title[0]).toMatchObject({ fontFamily: 'Fraunces', fontWeight: 600 });
    expect(body[0]).toMatchObject({ fontFamily: 'Outfit', fontWeight: 400, opacity: 0.85 });
  });

  it('wraps the title and body to maxWidth, and a narrower width gives more lines', () => {
    const wide = kinds(renderEditorial(makeInput()));
    for (const t of wide.body) expect(measureTextWidth(t.text, 13, 'Outfit', 400)).toBeLessThanOrEqual(221);
    expect(wide.body.length).toBeGreaterThan(1);
    const narrow = kinds(renderEditorial(makeInput({ settings: { ...defaultEditorialSettings, maxWidth: 140 } })));
    expect(narrow.body.length).toBeGreaterThan(wide.body.length);
  });

  it('puts the rule on the leading edge and the text beside it, above the origin for a point below', () => {
    const scene = renderEditorial(makeInput());
    const rule = ruleOf(scene)!;
    expect(rule.points[0]).toEqual([0, 0]);
    expect(rule.points[1][1]).toBeLessThan(-60);
    expect(texts(scene).every((t) => t.align === 'left' && t.x === 12 && t.y < 0)).toBe(true);
    expect(leaderOf(scene)!.points).toEqual([[-50, 100], [0, 0]]);
  });

  it('hangs below the origin when the point is above it', () => {
    const scene = renderEditorial(makeInput({ ground: { x: -50, y: -100 } }));
    expect(ruleOf(scene)!.points[1][1]).toBeGreaterThan(60);
    expect(texts(scene).every((t) => t.y >= 0)).toBe(true);
  });

  it('mirrors for a point on the right', () => {
    const scene = renderEditorial(makeInput({ ground: { x: 50, y: 100 } }));
    expect(texts(scene).every((t) => t.align === 'right' && t.x === -12)).toBe(true);
    expect(resolveDirection('auto', 50)).toBe(-1);
    expect(resolveDirection('right', 50)).toBe(1);
  });

  it('leaves out the slots that are empty, and shortens the rule with them', () => {
    const titleOnly = renderEditorial(makeInput({ content: { title: 'Opera House' } }));
    const k = kinds(titleOnly);
    expect(k.eyebrow).toHaveLength(0);
    expect(k.body).toHaveLength(0);
    expect(k.title).toHaveLength(1);
    expect(Math.abs(ruleOf(titleOnly)!.points[1][1])).toBeLessThan(Math.abs(ruleOf(renderEditorial(makeInput()))!.points[1][1]));
  });

  it('applies colours and the halo setting', () => {
    const scene = renderEditorial(makeInput({ settings: { ...defaultEditorialSettings, accentColor: '#00ff00', textColor: '#0000ff', halo: false } }));
    expect(ruleOf({ ...scene })).toBeUndefined();
    expect(lines(scene).some((l) => l.stroke === '#00ff00')).toBe(true);
    expect(kinds(scene).title[0].fill).toBe('#0000ff');
    expect(flatten(scene).some((n) => 'shadow' in n && n.shadow)).toBe(false);
    expect(flatten(scene).find((n): n is CircleNode => n.type === 'circle')!.fill).toBe('#00ff00');
  });
});

describe('measure', () => {
  it('covers the point, the rule and the widest line, in every phase', () => {
    const b = measureEditorial(makeInput());
    expect(b.x).toBeLessThanOrEqual(-50);
    expect(b.y + b.height).toBeGreaterThanOrEqual(100);
    expect(b.x + b.width).toBeGreaterThan(200);
    expect(measureEditorial(makeInput({ phase: 'enter', phaseProgress: 0 }))).toEqual(b);
  });
});

describe('entrance choreography', () => {
  it('draws nothing at progress 0 and the finished state at 1', () => {
    expect(enter(0)).toEqual({ type: 'group', children: [] });
    expect(enter(1)).toEqual(renderEditorial(makeInput()));
  });

  it('runs dot, then line, then rule, then text', () => {
    const early = enter(0.05);
    expect(flatten(early).some((n) => n.type === 'group' && n.scale !== undefined)).toBe(true);
    expect(lines(early)).toHaveLength(0);

    const line = enter(0.25);
    expect(leaderOf(line)!.progress).toBeGreaterThan(0);
    expect(ruleOf(line)).toBeUndefined();

    const rule = enter(0.45);
    expect(ruleOf(rule)!.progress).toBeGreaterThan(0);
    expect(ruleOf(rule)!.progress).toBeLessThan(1);
    expect(texts(rule)).toHaveLength(0);
  });

  it('brings text lines in one after another, rising, eyebrow first and body last', () => {
    const mid = enter(0.7);
    const all = texts(mid);
    expect(all.length).toBeGreaterThan(0);
    expect(all[0].fontSize).toBe(11);
    const settled = texts(renderEditorial(makeInput()));
    expect(all.length).toBeLessThan(settled.length);
    expect(all[0].opacity!).toBeGreaterThan(all[all.length - 1].opacity!);
    const rising = all[all.length - 1];
    const rest = settled.find((t) => t.text === rising.text)!;
    expect(rising.y).toBeGreaterThan(rest.y);
    expect(kinds(enter(0.7)).body.length).toBeLessThan(kinds(renderEditorial(makeInput())).body.length);
  });
});

describe('exit choreography', () => {
  it('plays the entrance in reverse', () => {
    for (const p of [0, 0.3, 0.7, 1]) {
      expect(renderEditorial(makeInput({ phase: 'exit', phaseProgress: p }))).toEqual(enter(1 - p));
    }
  });
});

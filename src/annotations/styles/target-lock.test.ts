import { describe, it, expect } from 'vitest';
import type { GroupNode, PolylineNode, RectNode, SceneNode, StyleRenderInput, TextNode } from '../types';
import {
  defaultTargetLockSettings,
  measureTargetLock,
  renderTargetLock,
  resolveDirection,
  targetLockSettingsSchema,
  targetLockStyle,
  type TargetLockSettings,
} from './target-lock';

const GROUND = { x: -80, y: 80 };

function makeInput(overrides: Partial<StyleRenderInput<TargetLockSettings>> = {}): StyleRenderInput<TargetLockSettings> {
  return {
    content: { title: 'Harbour Bridge', subtitle: 'Sydney, Australia', eyebrow: '33.85° S, 151.21° E' },
    settings: { ...defaultTargetLockSettings },
    phase: 'visible',
    phaseProgress: 1,
    ground: GROUND,
    itemTime: 3,
    playheadTime: 3,
    pixelRatio: 1,
    ...overrides,
  };
}

const enter = (progress: number, overrides: Partial<StyleRenderInput<TargetLockSettings>> = {}) =>
  renderTargetLock(makeInput({ phase: 'enter', phaseProgress: progress, ...overrides }));

function flatten(node: SceneNode): SceneNode[] {
  return node.type === 'group' ? [node, ...node.children.flatMap(flatten)] : [node];
}
const texts = (scene: SceneNode) => flatten(scene).filter((n): n is TextNode => n.type === 'text');
const polylines = (scene: SceneNode) => flatten(scene).filter((n): n is PolylineNode => n.type === 'polyline');
const lockGroup = (scene: SceneNode) => flatten(scene).find((n): n is GroupNode => n.type === 'group' && n.scale !== undefined);
const caret = (scene: SceneNode) => flatten(scene).find((n): n is RectNode => n.type === 'rect' && n.fill === '#3DFFA8');
const leader = (scene: SceneNode) => polylines(scene).find((l) => l.points.length === 3 && l.strokeWidth === 1);

describe('targetLockStyle definition', () => {
  it('is a self-connecting data style with the eyebrow slot', () => {
    expect(targetLockStyle).toMatchObject({
      id: 'target-lock',
      category: 'data',
      icon: 'crosshair',
      drawsConnector: true,
      defaultTransition: { enter: 'auto', exit: 'auto', enterDuration: 1.4 },
    });
    expect(targetLockStyle.contentSlots).toEqual(['eyebrow', 'title', 'subtitle']);
    expect(targetLockStyle.controls.map((c) => c.key).sort()).toEqual(Object.keys(defaultTargetLockSettings).sort());
    expect(targetLockSettingsSchema.parse({}).accentColor).toBe('#3DFFA8');
  });
});

describe('layout', () => {
  it('centres a 44px bracket square on the ground point with four corners', () => {
    const scene = renderTargetLock(makeInput());
    const group = lockGroup(scene)!;
    expect([group.x, group.y, group.scale]).toEqual([-80, 80, 1]);
    const corners = group.children as PolylineNode[];
    expect(corners).toHaveLength(4);
    const xs = corners.flatMap((c) => c.points.map((p) => Math.abs(p[0])));
    expect(Math.max(...xs)).toBe(22);
  });

  it('runs the line from the bracket corner facing the readout, through the origin, along the panel', () => {
    const points = leader(renderTargetLock(makeInput()))!.points;
    expect(points[0]).toEqual([-80 + 22, 80 - 22]);
    expect(points[1]).toEqual([0, 0]);
    expect(points[2][0]).toBeGreaterThan(90);
  });

  it('mirrors for a point on the right', () => {
    const points = leader(renderTargetLock(makeInput({ ground: { x: 80, y: 80 } })))!.points;
    expect(points[0]).toEqual([80 - 22, 80 - 22]);
    expect(points[2][0]).toBeLessThan(-90);
    expect(resolveDirection('auto', 80)).toBe(-1);
    expect(resolveDirection('left', -80)).toBe(-1);
    expect(resolveDirection('right', 80)).toBe(1);
  });

  it('sets the readout in mono: coordinates small, title bold capitals, subtitle optional', () => {
    const [eyebrow, title, subtitle] = texts(renderTargetLock(makeInput()));
    expect(eyebrow).toMatchObject({ text: '33.85° S, 151.21° E', fontFamily: 'JetBrains Mono', fontSize: 11, fill: '#3DFFA8' });
    expect(title).toMatchObject({ text: 'HARBOUR BRIDGE', fontFamily: 'JetBrains Mono', fontSize: 16, fontWeight: 700 });
    expect(subtitle.text).toBe('Sydney, Australia');
    expect(texts(renderTargetLock(makeInput({ content: { title: 'Solo' } })))).toHaveLength(1);
  });

  it('applies colours and the halo setting', () => {
    const scene = renderTargetLock(makeInput({ settings: { ...defaultTargetLockSettings, accentColor: '#ff00ff', textColor: '#0000ff', halo: false } }));
    expect(polylines(scene).every((l) => l.stroke === '#ff00ff' && !l.shadow)).toBe(true);
    expect(texts(scene)[1].fill).toBe('#0000ff');
    expect(texts(renderTargetLock(makeInput())).every((t) => t.shadow)).toBe(true);
  });
});

describe('measure', () => {
  it('reaches the ground point and the widened opening brackets, in every phase', () => {
    const b = measureTargetLock(makeInput());
    expect(b.x).toBeLessThanOrEqual(-80 - 66);
    expect(b.y + b.height).toBeGreaterThanOrEqual(80 + 66);
    expect(measureTargetLock(makeInput({ phase: 'enter', phaseProgress: 0 }))).toEqual(b);
  });
});

describe('entrance choreography', () => {
  it('draws nothing at progress 0 and the finished state at 1', () => {
    expect(enter(0)).toEqual({ type: 'group', children: [] });
    expect(enter(1)).toEqual(renderTargetLock(makeInput()));
  });

  it('starts the brackets about three times wide, then snaps in past 1 and settles', () => {
    expect(lockGroup(enter(0.01))!.scale).toBeGreaterThan(2.5);
    const scales = Array.from({ length: 41 }, (_, i) => lockGroup(enter(i / 100))?.scale ?? 3);
    expect(Math.min(...scales)).toBeLessThan(1);
    expect(lockGroup(enter(0.4))!.scale).toBe(1);
    expect(lockGroup(enter(0.05))!.opacity).toBeLessThan(lockGroup(enter(0.2))!.opacity!);
  });

  it('draws the crosshair, then the line, before any text', () => {
    expect(polylines(enter(0.2)).some((l) => l.points.length === 2)).toBe(true);
    expect(leader(enter(0.2))).toBeUndefined();
    const mid = leader(enter(0.45))!;
    expect(mid.progress).toBeGreaterThan(0);
    expect(mid.progress).toBeLessThan(1);
    expect(texts(enter(0.45))).toHaveLength(0);
  });

  it('scrambles the coordinates into place while the title has not started', () => {
    const early = texts(enter(0.6, { itemTime: 0.6 }));
    expect(early).toHaveLength(1);
    expect(early[0].text).not.toBe('33.85° S, 151.21° E');
    expect(early[0].text).toHaveLength('33.85° S, 151.21° E'.length);
    expect(texts(enter(0.85))[0].text).toBe('33.85° S, 151.21° E');
  });

  it('types the title with a caret that is gone once it is finished', () => {
    const typing = enter(0.75, { itemTime: 0 });
    const title = texts(typing).find((t) => t.fontSize === 16)!;
    expect(title.text.length).toBeGreaterThan(0);
    expect(title.text.length).toBeLessThan('HARBOUR BRIDGE'.length);
    expect(caret(typing)).toBeDefined();
    // Blinks: off in the second half of its period.
    expect(caret(enter(0.75, { itemTime: 0.3 }))).toBeUndefined();
    expect(caret(enter(1))).toBeUndefined();
    expect(caret(renderTargetLock(makeInput()))).toBeUndefined();
  });

  it('fades the subtitle in last', () => {
    expect(texts(enter(0.8)).some((t) => t.fontSize === 12)).toBe(false);
    const late = texts(enter(0.92)).find((t) => t.fontSize === 12)!;
    expect(late.opacity).toBeGreaterThan(0);
    expect(late.opacity).toBeLessThan(0.8);
  });
});

describe('exit choreography', () => {
  it('plays the entrance in reverse', () => {
    for (const p of [0, 0.3, 0.7, 1]) {
      expect(renderTargetLock(makeInput({ phase: 'exit', phaseProgress: p }))).toEqual(enter(1 - p));
    }
  });
});

describe('visible phase', () => {
  it('is still without pulse, and breathes the brackets with it', () => {
    expect(renderTargetLock(makeInput({ itemTime: 3 }))).toEqual(renderTargetLock(makeInput({ itemTime: 4.3 })));
    const settings = { ...defaultTargetLockSettings, pulse: true };
    const a = lockGroup(renderTargetLock(makeInput({ settings, itemTime: 0 })))!.scale!;
    const b = lockGroup(renderTargetLock(makeInput({ settings, itemTime: 1 })))!.scale!;
    expect(a).toBeCloseTo(1);
    expect(b).toBeGreaterThan(1);
    expect(b).toBeLessThan(1.1);
    expect(lockGroup(enter(1, { settings, itemTime: 1 }))!.scale).toBe(1);
  });
});

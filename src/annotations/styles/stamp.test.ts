import { describe, it, expect } from 'vitest';
import type { CircleNode, GroupNode, PolylineNode, SceneNode, StyleRenderInput, TextNode } from '../types';
import {
  defaultStampSettings,
  inkSpans,
  measureStamp,
  renderStamp,
  stampSettingsSchema,
  stampStyle,
  type StampSettings,
} from './stamp';

function makeInput(overrides: Partial<StyleRenderInput<StampSettings>> = {}): StyleRenderInput<StampSettings> {
  return {
    content: { title: 'Approved', subtitle: 'Sydney Australia' },
    settings: { ...defaultStampSettings },
    phase: 'visible',
    phaseProgress: 1,
    ground: { x: 0, y: 0 },
    itemTime: 3,
    playheadTime: 3,
    pixelRatio: 1,
    ...overrides,
  };
}

const enter = (progress: number, overrides: Partial<StyleRenderInput<StampSettings>> = {}) =>
  renderStamp(makeInput({ phase: 'enter', phaseProgress: progress, ...overrides }));
const exit = (progress: number, overrides: Partial<StyleRenderInput<StampSettings>> = {}) =>
  renderStamp(makeInput({ phase: 'exit', phaseProgress: progress, ...overrides }));

function flatten(node: SceneNode): SceneNode[] {
  return node.type === 'group' ? [node, ...node.children.flatMap(flatten)] : [node];
}
const texts = (scene: SceneNode) => flatten(scene).filter((n): n is TextNode => n.type === 'text');
const circles = (scene: SceneNode) => flatten(scene).filter((n): n is CircleNode => n.type === 'circle');
const polylines = (scene: SceneNode) => flatten(scene).filter((n): n is PolylineNode => n.type === 'polyline');
/** The group that holds the stamp itself: the last child of the root. */
const body = (scene: SceneNode): GroupNode => {
  const root = scene as GroupNode;
  return root.children[root.children.length - 1] as GroupNode;
};

const rect = (overrides: Partial<StampSettings> = {}) => ({ ...defaultStampSettings, shape: 'rect' as const, ...overrides });

describe('stampStyle definition', () => {
  it('sits centred on the point with no connector or altitude', () => {
    expect(stampStyle).toMatchObject({
      id: 'stamp',
      category: 'editorial',
      icon: 'stamp',
      supportsAltitude: false,
      drawsConnector: false,
      defaultAnchor: 'center',
      defaultOffset: [0, 0],
      defaultTransition: { enter: 'auto', exit: 'auto', enterDuration: 0.7 },
    });
    expect(stampStyle.controls.map((c) => c.key).sort()).toEqual(Object.keys(defaultStampSettings).sort());
  });

  it('fills defaults and rejects unknown shapes', () => {
    expect(stampSettingsSchema.parse({})).toEqual(defaultStampSettings);
    expect(stampSettingsSchema.safeParse({ shape: 'star' }).success).toBe(false);
  });
});

describe('round stamp', () => {
  it('sets the title letter by letter on an arc, in uppercase condensed bold', () => {
    const glyphs = texts(renderStamp(makeInput())).filter((t) => t.text.length === 1 && t.fontSize < 25);
    expect(glyphs.map((t) => t.text).join('')).toBe('APPROVED');
    expect(glyphs.every((t) => t.fontFamily === 'Barlow Condensed' && t.fontWeight === 700)).toBe(true);
  });

  it('puts the subtitle across the middle, uppercase', () => {
    const subtitle = texts(renderStamp(makeInput())).find((t) => t.text === 'SYDNEY AUSTRALIA');
    expect(subtitle).toMatchObject({ x: 0, y: 0, align: 'center' });
  });

  it('draws a double ring, and a star in the middle when there is no subtitle', () => {
    const radii = new Set(circles(renderStamp(makeInput())).filter((c) => c.stroke).map((c) => c.r));
    expect(radii.size).toBeGreaterThanOrEqual(2);
    const bare = renderStamp(makeInput({ content: { title: 'Solo' } }));
    expect(flatten(bare).filter((n) => n.type === 'path').length).toBe(2); // foot star + centre star
    expect(flatten(renderStamp(makeInput())).filter((n) => n.type === 'path').length).toBe(1);
  });

  it('grows the ring for a long title instead of cramming it', () => {
    const outer = (title: string) => Math.max(...circles(renderStamp(makeInput({ content: { title } }))).map((c) => c.r));
    expect(outer('Harbour Bridge Crossing And Tunnel')).toBeGreaterThan(outer('Rome'));
  });
});

describe('rect stamp', () => {
  it('draws two rough outlines and the title large with the subtitle small', () => {
    const scene = renderStamp(makeInput({ settings: rect() }));
    expect(polylines(scene).length).toBeGreaterThanOrEqual(2);
    const [title, subtitle] = texts(scene);
    expect(title).toMatchObject({ text: 'APPROVED', fontFamily: 'Barlow Condensed', fontWeight: 700 });
    expect(title.fontSize).toBeGreaterThan(subtitle.fontSize);
    expect(subtitle.y).toBeGreaterThan(title.y);
  });

  it('drops the subtitle line when empty', () => {
    expect(texts(renderStamp(makeInput({ settings: rect(), content: { title: 'Paris' } })))).toHaveLength(1);
  });

  it('widens for a longer title', () => {
    const width = (title: string) => measureStamp(makeInput({ settings: rect(), content: { title } })).width;
    expect(width('Confidential and restricted')).toBeGreaterThan(width('Paris'));
  });
});

describe('ink texture', () => {
  it('wears seeded gaps into the strokes, the same ones every time', () => {
    const spans = inkSpans(300, 5);
    expect(spans.length).toBe(4);
    expect(inkSpans(300, 5)).toEqual(spans);
    expect(inkSpans(300, 6)).not.toEqual(spans);
    for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThan(spans[i - 1][1]);
  });

  it('splits the rings into several arcs', () => {
    const arcs = circles(renderStamp(makeInput())).filter((c) => c.startAngle !== undefined);
    expect(arcs.length).toBeGreaterThan(4);
  });
});

describe('settings', () => {
  it('rotates by the setting, in radians', () => {
    expect(body(renderStamp(makeInput())).rotation).toBeCloseTo((-8 * Math.PI) / 180);
    expect(body(renderStamp(makeInput({ settings: { ...defaultStampSettings, rotation: 15 } }))).rotation).toBeCloseTo(
      (15 * Math.PI) / 180,
    );
  });

  it('inks everything in the colour at about 0.9 opacity', () => {
    const scene = renderStamp(makeInput({ settings: { ...defaultStampSettings, inkColor: '#123456' } }));
    expect(body(scene).opacity).toBeCloseTo(0.9);
    expect(texts(scene).every((t) => t.fill === '#123456')).toBe(true);
  });

  it('turns the halo off', () => {
    const flat = renderStamp(makeInput({ settings: { ...defaultStampSettings, halo: false } }));
    expect(flatten(flat).some((n) => 'shadow' in n && n.shadow)).toBe(false);
    expect(flatten(renderStamp(makeInput())).some((n) => 'shadow' in n && n.shadow)).toBe(true);
  });
});

describe('choreography', () => {
  it('draws nothing at progress 0', () => {
    expect(flatten(enter(0)).filter((n) => n.type !== 'group')).toHaveLength(0);
  });

  it('falls in large and faint, and lands slightly under full size at the halfway mark', () => {
    const early = body(enter(0.1));
    expect(early.scale).toBeGreaterThan(1.5);
    expect(early.opacity!).toBeLessThan(0.9);
    expect(body(enter(0.5)).scale).toBeCloseTo(0.94, 2);
    expect(body(enter(0.9)).scale).toBeGreaterThan(0.94);
  });

  it('shudders after landing and is still by the end', () => {
    const base = (-8 * Math.PI) / 180;
    const shaken = Math.abs(body(enter(0.6)).rotation! - base);
    expect(shaken).toBeGreaterThan(0.005);
    expect(body(enter(1)).rotation).toBe(base);
  });

  it('spreads an impact ring only after landing, and only when enabled', () => {
    const ring = (scene: SceneNode) => (scene as GroupNode).children.length;
    expect(ring(enter(0.3))).toBe(1);
    expect(ring(enter(0.65))).toBe(2);
    expect(ring(enter(1))).toBe(1);
    expect(ring(enter(0.65, { settings: { ...defaultStampSettings, splash: false } }))).toBe(1);
  });

  it('fades out on exit rather than slamming back up', () => {
    const late = body(exit(0.5));
    expect(late.scale!).toBeGreaterThanOrEqual(1);
    expect(late.scale!).toBeLessThan(1.1);
    expect(late.opacity!).toBeLessThan(0.9);
    expect(late.rotation).toBeCloseTo((-8 * Math.PI) / 180);
    expect(flatten(exit(1)).filter((n) => n.type !== 'group')).toHaveLength(0);
  });
});

describe('measure', () => {
  it('covers the ring and the widest the impact ring spreads', () => {
    const bounds = measureStamp(makeInput());
    const radius = Math.max(...circles(renderStamp(makeInput())).map((c) => c.r));
    expect(bounds.width).toBeGreaterThan(radius * 2 * 1.25);
    expect(bounds.x + bounds.width / 2).toBeCloseTo(0, 0);
    expect(measureStamp(makeInput({ phase: 'enter', phaseProgress: 0 }))).toEqual(bounds);
  });

  it('is smaller without the impact ring', () => {
    const settings = { ...defaultStampSettings, splash: false };
    expect(measureStamp(makeInput({ settings })).width).toBeLessThan(measureStamp(makeInput()).width);
  });
});

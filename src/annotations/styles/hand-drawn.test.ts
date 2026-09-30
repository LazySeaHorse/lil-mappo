import { describe, it, expect } from 'vitest';
import type { GroupNode, PolylineNode, SceneNode, StyleRenderInput, TextNode } from '../types';
import {
  defaultHandDrawnSettings,
  handDrawnSettingsSchema,
  handDrawnStyle,
  measureHandDrawn,
  renderHandDrawn,
  seedFor,
  type HandDrawnSettings,
} from './hand-drawn';

const GROUND = { x: -80, y: 100 };

function makeInput(overrides: Partial<StyleRenderInput<HandDrawnSettings>> = {}): StyleRenderInput<HandDrawnSettings> {
  return {
    content: { title: 'Harbour Bridge', subtitle: 'Sydney, Australia' },
    settings: { ...defaultHandDrawnSettings },
    phase: 'visible',
    phaseProgress: 1,
    ground: GROUND,
    itemTime: 3,
    playheadTime: 3,
    pixelRatio: 1,
    ...overrides,
  };
}

const enter = (progress: number, overrides: Partial<StyleRenderInput<HandDrawnSettings>> = {}) =>
  renderHandDrawn(makeInput({ phase: 'enter', phaseProgress: progress, ...overrides }));

function flatten(node: SceneNode): SceneNode[] {
  return node.type === 'group' ? [node, ...node.children.flatMap(flatten)] : [node];
}
const texts = (scene: SceneNode) => flatten(scene).filter((n): n is TextNode => n.type === 'text');
const lines = (scene: SceneNode) => flatten(scene).filter((n): n is PolylineNode => n.type === 'polyline');
const clips = (scene: SceneNode) => flatten(scene).filter((n): n is GroupNode => n.type === 'group' && !!n.clip);

describe('handDrawnStyle definition', () => {
  it('is a self-connecting editorial style with the arrow as its connector', () => {
    expect(handDrawnStyle).toMatchObject({
      id: 'hand-drawn',
      category: 'editorial',
      icon: 'pen-line',
      drawsConnector: true,
      defaultTransition: { enter: 'auto', exit: 'auto', enterDuration: 1.6 },
    });
    expect(handDrawnStyle.controls.map((c) => c.key).sort()).toEqual(Object.keys(defaultHandDrawnSettings).sort());
  });

  it('fills defaults', () => {
    expect(handDrawnSettingsSchema.parse({})).toEqual(defaultHandDrawnSettings);
  });
});

describe('layout', () => {
  it('writes the title in Caveat 600 at 26px, tilted, with the subtitle smaller', () => {
    const scene = renderHandDrawn(makeInput());
    const [title, subtitle] = texts(scene);
    expect(title).toMatchObject({ text: 'Harbour Bridge', fontFamily: 'Caveat', fontWeight: 600, fontSize: 26 });
    expect(subtitle.fontSize).toBeLessThan(title.fontSize);
    const tilted = flatten(scene).find((n): n is GroupNode => n.type === 'group' && n.rotation !== undefined);
    expect(tilted?.rotation).toBeCloseTo((-3 * Math.PI) / 180);
  });

  it('mirrors the label and its tilt for the left side', () => {
    const left = renderHandDrawn(makeInput({ settings: { ...defaultHandDrawnSettings, side: 'left' } }));
    expect(texts(left).every((t) => t.x < 0)).toBe(true);
    const tilted = flatten(left).find((n): n is GroupNode => n.type === 'group' && n.rotation !== undefined);
    expect(tilted!.rotation).toBeGreaterThan(0);
  });

  it('draws a circle around the ground point and an arrow that ends short of it', () => {
    const [circle, , shaft] = lines(renderHandDrawn(makeInput()));
    const xs = circle.points.map((p) => p[0]);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(GROUND.x, -1);
    expect(circle.lineCap).toBe('round');
    expect(circle.strokeWidth).toBeGreaterThanOrEqual(2.5);
    const tip = shaft.points[shaft.points.length - 1];
    const gap = Math.hypot(tip[0] - GROUND.x, tip[1] - GROUND.y);
    expect(gap).toBeGreaterThan(defaultHandDrawnSettings.circleSize);
  });

  it('omits the subtitle when empty', () => {
    expect(texts(renderHandDrawn(makeInput({ content: { title: 'Solo' } })))).toHaveLength(1);
  });

  it('is stable per title and different between titles', () => {
    expect(seedFor('Mont Blanc')).toBe(seedFor('Mont Blanc'));
    expect(seedFor('Mont Blanc')).not.toBe(seedFor('Harbour Bridge'));
    const other = renderHandDrawn(makeInput({ content: { title: 'Mont Blanc' } }));
    expect(lines(other)[0].points).not.toEqual(lines(renderHandDrawn(makeInput()))[0].points);
  });
});

describe('choreography', () => {
  it('draws nothing at progress 0', () => {
    expect(flatten(enter(0)).filter((n) => n.type !== 'group')).toHaveLength(0);
  });

  it('has the circle part-drawn and no writing at 15%', () => {
    const scene = enter(0.15);
    const [circle] = lines(scene);
    expect(circle.progress).toBeGreaterThan(0.1);
    expect(circle.progress).toBeLessThan(1);
    expect(texts(scene)).toHaveLength(0);
  });

  it('has the circle done and the arrow drawing at 50%, with the words not yet started', () => {
    const scene = enter(0.5);
    expect(lines(scene)[0].progress).toBe(1);
    expect(lines(scene).some((l) => l.progress !== undefined && l.progress > 0 && l.progress < 1)).toBe(true);
    expect(texts(scene)).toHaveLength(0);
  });

  it('wipes the title in left to right and finishes with the subtitle', () => {
    const mid = enter(0.76);
    expect(texts(mid)).toHaveLength(1);
    const [clip] = clips(mid);
    const full = clips(renderHandDrawn(makeInput()))[0];
    expect(clip.clip!.width).toBeGreaterThan(0);
    expect(clip.clip!.width).toBeLessThan(full.clip!.width);
    expect(texts(enter(1))).toHaveLength(2);
  });

  it('erases on exit by playing the entrance back', () => {
    const exit = renderHandDrawn(makeInput({ phase: 'exit', phaseProgress: 0.9 }));
    expect(texts(exit)).toHaveLength(0);
  });
});

describe('settings and measure', () => {
  it('applies colours, size and halo', () => {
    const scene = renderHandDrawn(makeInput({
      settings: { ...defaultHandDrawnSettings, strokeColor: '#00ff00', textColor: '#0000ff', circleSize: 60, halo: false },
    }));
    expect(lines(scene).every((l) => l.stroke === '#00ff00' && !l.shadow)).toBe(true);
    expect(texts(scene).every((t) => t.fill === '#0000ff' && !t.shadow)).toBe(true);
    const big = lines(scene)[0].points.map((p) => p[1]);
    expect(Math.max(...big) - Math.min(...big)).toBeGreaterThan(110);
    expect(texts(renderHandDrawn(makeInput())).every((t) => t.shadow)).toBe(true);
  });

  it('measures the circle, the arrow and the writing', () => {
    const bounds = measureHandDrawn(makeInput());
    expect(bounds.x).toBeLessThanOrEqual(GROUND.x - 34);
    expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(GROUND.y + 34);
    expect(bounds.y).toBeLessThanOrEqual(-26);
    expect(measureHandDrawn(makeInput({ phase: 'enter', phaseProgress: 0 }))).toEqual(bounds);
  });
});

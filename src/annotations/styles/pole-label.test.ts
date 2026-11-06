import { describe, it, expect } from 'vitest';
import type { PolylineNode, SceneNode, StyleRenderInput, TextNode } from '../types';
import { measureScene } from '../scene/measure';
import { defaultPoleLabelSettings, measurePoleLabel, poleLabelStyle, renderPoleLabel, type PoleLabelSettings } from './pole-label';

const FULL = { title: 'Parma', body: 'km 12', subtitle: 'alt. 55m' };

function makeInput(overrides: Partial<StyleRenderInput<PoleLabelSettings>> = {}): StyleRenderInput<PoleLabelSettings> {
  return {
    content: FULL,
    settings: { ...defaultPoleLabelSettings },
    phase: 'visible',
    phaseProgress: 1,
    ground: { x: 0, y: 0 },
    itemTime: 3,
    playheadTime: 3,
    pixelRatio: 1,
    ...overrides,
  };
}

const withSettings = (settings: Partial<PoleLabelSettings>, content: StyleRenderInput['content'] = FULL) =>
  renderPoleLabel(makeInput({ settings: { ...defaultPoleLabelSettings, ...settings }, content }));
const enter = (progress: number) => renderPoleLabel(makeInput({ phase: 'enter', phaseProgress: progress }));

function flatten(node: SceneNode): SceneNode[] {
  return node.type === 'group' ? [node, ...node.children.flatMap(flatten)] : [node];
}
const texts = (scene: SceneNode) => flatten(scene).filter((n): n is TextNode => n.type === 'text');
const poles = (scene: SceneNode) => flatten(scene).filter((n): n is PolylineNode => n.type === 'polyline');

describe('poleLabelStyle definition', () => {
  it('is a self-animating label that stands on its point', () => {
    expect(poleLabelStyle).toMatchObject({
      id: 'pole-label',
      category: 'label',
      contentSlots: ['title', 'body', 'subtitle'],
      supportsAltitude: false,
      defaultOffset: [0, 0],
      drawsConnector: false,
      defaultTransition: { enter: 'auto', exit: 'auto' },
    });
    expect(poleLabelStyle.controls.map((c) => c.key).sort()).toEqual(Object.keys(defaultPoleLabelSettings).sort());
  });
});

describe('pole label finished state', () => {
  it('draws a pole from the point straight up by its height', () => {
    const [pole] = poles(renderPoleLabel(makeInput()));
    expect(pole.points).toEqual([[0, 0], [0, -defaultPoleLabelSettings.height]]);
    expect(pole.stroke).toBe(defaultPoleLabelSettings.lineColor);
    const [tall] = poles(withSettings({ height: 200 }));
    expect(tall.points[1]).toEqual([0, -200]);
  });

  it('hangs the lines from the pole’s top, title first, to the right by default', () => {
    const lines = texts(renderPoleLabel(makeInput()));
    expect(lines.map((t) => t.text)).toEqual(['Parma', 'km 12', 'alt. 55m']);
    expect(lines[0].fontSize).toBeGreaterThan(lines[1].fontSize);
    expect(lines.every((t) => t.align === 'left' && t.x > 0)).toBe(true);
    expect(lines[0].y).toBe(-defaultPoleLabelSettings.height);
    expect(lines[1].y).toBeGreaterThan(lines[0].y);
    expect(lines[2].y).toBeGreaterThan(lines[1].y);
  });

  it('puts the lines on the left, right-aligned', () => {
    const lines = texts(withSettings({ position: 'left' }));
    expect(lines.every((t) => t.align === 'right' && t.x < 0)).toBe(true);
  });

  it('centres the lines over the pole’s top when they are on top, the last one just above it', () => {
    const lines = texts(withSettings({ position: 'top' }));
    expect(lines.every((t) => t.align === 'center' && t.x === 0)).toBe(true);
    const last = lines[lines.length - 1];
    expect(last.y + last.fontSize).toBeLessThan(-defaultPoleLabelSettings.height);
  });

  it('puts the title last, under the small lines, when asked', () => {
    const lines = texts(withSettings({ titleOrder: 'last' }));
    expect(lines.map((t) => t.text)).toEqual(['alt. 55m', 'km 12', 'Parma']);
    expect(lines[2].y).toBeGreaterThan(lines[0].y);
  });

  it('draws only the lines that have text', () => {
    expect(texts(withSettings({}, { title: 'Parma' })).map((t) => t.text)).toEqual(['Parma']);
    expect(texts(withSettings({}, { title: '' }))).toHaveLength(0);
    expect(poles(withSettings({}, { title: '' }))).toHaveLength(1);
  });

  it('removes the shadows when halo is off', () => {
    const shadowed = flatten(withSettings({ halo: false })).filter((n) => 'shadow' in n && n.shadow);
    expect(shadowed).toHaveLength(0);
  });
});

describe('pole label entrance', () => {
  it('draws the pole up before any text appears', () => {
    const early = enter(0.2);
    expect(poles(early)[0].progress).toBeGreaterThan(0);
    expect(poles(early)[0].progress).toBeLessThan(1);
    expect(texts(early)).toHaveLength(0);
    expect(poles(enter(0.6))[0].progress).toBe(1);
  });

  it('brings the lines in one after another, sliding out from the pole', () => {
    const mid = texts(enter(0.7));
    expect(mid.length).toBeGreaterThan(0);
    expect(mid.length).toBeLessThan(3);
    const final = texts(enter(1));
    expect(final).toHaveLength(3);
    expect(mid[1].opacity!).toBeLessThan(0.9);
    expect(mid[1].x).toBeLessThan(final[1].x);
  });

  it('plays the exit as the entrance reversed', () => {
    expect(renderPoleLabel(makeInput({ phase: 'exit', phaseProgress: 0.4 }))).toEqual(enter(0.6));
  });
});

describe('pole label bounds', () => {
  it('contain every position and order', () => {
    for (const position of ['right', 'left', 'top'] as const) {
      for (const titleOrder of ['first', 'last'] as const) {
        const input = makeInput({ settings: { ...defaultPoleLabelSettings, position, titleOrder } });
        const bounds = measurePoleLabel(input);
        const drawn = measureScene(renderPoleLabel(input));
        expect(bounds.x).toBeLessThanOrEqual(drawn.minX + 0.5);
        expect(bounds.y).toBeLessThanOrEqual(drawn.minY + 0.5);
        expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(drawn.maxX - 0.5);
        expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(drawn.maxY - 0.5);
      }
    }
  });
});

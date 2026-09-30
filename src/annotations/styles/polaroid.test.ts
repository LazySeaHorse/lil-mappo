import { describe, it, expect } from 'vitest';
import type { GroupNode, ImageNode, PolylineNode, SceneNode, StyleRenderInput, TextNode } from '../types';
import { collectSceneAssets } from '../draw';
import {
  attachPoint,
  defaultPolaroidSettings,
  measurePolaroid,
  polaroidSettingsSchema,
  polaroidStyle,
  renderPolaroid,
  type PolaroidSettings,
} from './polaroid';

const GROUND = { x: -90, y: 100 };
const SRC = 'https://example.com/photo.jpg';

function makeInput(overrides: Partial<StyleRenderInput<PolaroidSettings>> = {}): StyleRenderInput<PolaroidSettings> {
  return {
    content: { title: 'Harbour Bridge', image: SRC },
    settings: { ...defaultPolaroidSettings },
    phase: 'visible',
    phaseProgress: 1,
    ground: GROUND,
    itemTime: 3,
    playheadTime: 3,
    pixelRatio: 1,
    ...overrides,
  };
}

const enter = (progress: number, overrides: Partial<StyleRenderInput<PolaroidSettings>> = {}) =>
  renderPolaroid(makeInput({ phase: 'enter', phaseProgress: progress, ...overrides }));

function flatten(node: SceneNode): SceneNode[] {
  return node.type === 'group' ? [node, ...node.children.flatMap(flatten)] : [node];
}
const texts = (scene: SceneNode) => flatten(scene).filter((n): n is TextNode => n.type === 'text');
const images = (scene: SceneNode) => flatten(scene).filter((n): n is ImageNode => n.type === 'image');
const lines = (scene: SceneNode) => flatten(scene).filter((n): n is PolylineNode => n.type === 'polyline');
/** The tilted group holding the print. */
const print = (scene: SceneNode) =>
  flatten(scene).find((n): n is GroupNode => n.type === 'group' && n.rotation !== undefined && n.anchorY !== undefined);
const deg = (radians: number) => (radians * 180) / Math.PI;

describe('polaroidStyle definition', () => {
  it('is a self-animating media style that draws its leader', () => {
    expect(polaroidStyle).toMatchObject({
      id: 'polaroid',
      category: 'media',
      icon: 'image',
      drawsConnector: true,
      defaultTransition: { enter: 'auto', exit: 'auto', enterDuration: 1.3 },
      contentSlots: ['title', 'image'],
    });
    expect(polaroidStyle.defaultOffset![0]).toBeGreaterThan(0);
    expect(polaroidStyle.defaultOffset![1]).toBeLessThan(0);
    expect(polaroidStyle.controls.map((c) => c.key).sort()).toEqual(Object.keys(defaultPolaroidSettings).sort());
  });

  it('fills defaults and rejects unknown attachments', () => {
    expect(polaroidSettingsSchema.parse({})).toEqual(defaultPolaroidSettings);
    expect(polaroidSettingsSchema.safeParse({ attach: 'glue' }).success).toBe(false);
  });
});

describe('layout', () => {
  it('sets the photo inside a frame with a thicker bottom border, cover-fitted', () => {
    const scene = renderPolaroid(makeInput());
    const [photo] = images(scene);
    expect(photo).toMatchObject({ src: SRC, objectFit: 'cover', width: 130, height: 130 });
    const frame = flatten(scene).find((n) => n.type === 'rect' && n.fill === '#FAF7F0');
    if (frame?.type !== 'rect') throw new Error('no frame');
    const bottom = frame.y + frame.height - (photo.y + photo.height);
    const side = photo.x - frame.x;
    expect(bottom).toBeGreaterThan(side * 3);
    expect(photo.y - frame.y).toBeCloseTo(side);
  });

  it('captions the bottom border in Caveat, and shrinks a long caption to fit', () => {
    const [caption] = texts(renderPolaroid(makeInput()));
    expect(caption).toMatchObject({ text: 'Harbour Bridge', fontFamily: 'Caveat', align: 'center' });
    const [long] = texts(renderPolaroid(makeInput({ content: { title: 'An extremely long caption that cannot fit', image: SRC } })));
    const [short] = texts(renderPolaroid(makeInput({ content: { title: 'Rome', image: SRC } })));
    expect(short.fontSize).toBe(25);
    expect(long.fontSize).toBeLessThan(short.fontSize);
    expect(long.maxWidth).toBeLessThanOrEqual(130);
  });

  it('draws a placeholder when there is no image, and no caption when there is no title', () => {
    const scene = renderPolaroid(makeInput({ content: { title: '' } }));
    expect(images(scene)).toHaveLength(0);
    expect(flatten(scene).some((n) => n.type === 'path')).toBe(true);
    expect(texts(scene)).toHaveLength(0);
  });

  it('tilts by the rotation setting', () => {
    expect(deg(print(renderPolaroid(makeInput()))!.rotation!)).toBeCloseTo(4);
    const custom = renderPolaroid(makeInput({ settings: { ...defaultPolaroidSettings, rotation: -7 } }));
    expect(deg(print(custom)!.rotation!)).toBeCloseTo(-7);
  });

  it('scales the print with the size setting', () => {
    const [photo] = images(renderPolaroid(makeInput({ settings: { ...defaultPolaroidSettings, size: 200 } })));
    expect(photo.width).toBe(200);
  });

  it('runs the leader from the ground point to the bottom of the tilted print', () => {
    const [leader] = lines(renderPolaroid(makeInput()));
    expect(leader.points[0]).toEqual([GROUND.x, GROUND.y]);
    expect(leader.points[1]).toEqual(attachPoint(130 + 9 + 38, 4));
  });

  it('adds a pin or a tape strip on top for those attachments', () => {
    const count = (attach: PolaroidSettings['attach']) =>
      flatten(renderPolaroid(makeInput({ settings: { ...defaultPolaroidSettings, attach } }))).length;
    expect(count('pin')).toBeGreaterThan(count('line'));
    expect(count('tape')).toBeGreaterThan(count('line'));
  });
});

describe('choreography', () => {
  it('draws nothing at progress 0', () => {
    expect(flatten(enter(0)).filter((n) => n.type !== 'group')).toHaveLength(0);
  });

  it('drops the print in from above, larger and more tilted, and settles with overshoot', () => {
    const early = print(enter(0.25))!;
    expect(early.y!).toBeLessThan(0);
    expect(early.scale!).toBeGreaterThan(1);
    expect(deg(early.rotation!)).toBeGreaterThan(4);
    const seen = [0.4, 0.45, 0.5, 0.55, 0.6].map((p) => deg(print(enter(p))!.rotation!));
    expect(Math.min(...seen)).toBeLessThan(4); // overshoots past its resting tilt
    expect(print(enter(1))!.y).toBe(0);
  });

  it('develops the photo from a pale wash over most of the entrance', () => {
    const at = (p: number) => images(enter(p))[0]?.opacity ?? 0;
    expect(at(0.3)).toBeLessThan(0.05);
    expect(at(0.5)).toBeGreaterThan(0.05);
    expect(at(0.5)).toBeLessThan(0.7);
    expect(at(0.9)).toBe(1);
  });

  it('brings the caption in last', () => {
    expect(texts(enter(0.7))).toHaveLength(0);
    expect(texts(enter(0.85))[0].opacity).toBeLessThan(1);
    expect(texts(enter(1))[0].opacity).toBe(1);
  });

  it('pops the ground dot before the print arrives', () => {
    const dots = (p: number) => flatten(enter(p)).filter((n) => n.type === 'circle');
    expect(dots(0.05).length).toBe(1);
    expect(images(enter(0.05))).toHaveLength(0);
  });
});

describe('export assets', () => {
  it('lists the photo so it is preloaded before export', () => {
    expect(collectSceneAssets(renderPolaroid(makeInput())).images).toEqual([SRC]);
    expect(collectSceneAssets(renderPolaroid(makeInput({ content: { title: 'x' } }))).images).toEqual([]);
  });

  it('lists the caption font', () => {
    expect(collectSceneAssets(renderPolaroid(makeInput())).fonts.join(' ')).toContain('Caveat');
  });
});

describe('measure', () => {
  it('covers the print, the ground point and room for the drop', () => {
    const bounds = measurePolaroid(makeInput());
    expect(bounds.x).toBeLessThanOrEqual(GROUND.x - 4);
    expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(GROUND.y + 4);
    expect(bounds.y).toBeLessThanOrEqual(-(130 + 47) - 44);
    expect(measurePolaroid(makeInput({ phase: 'enter', phaseProgress: 0.2 }))).toEqual(bounds);
  });

  it('grows with the size setting', () => {
    const big = measurePolaroid(makeInput({ settings: { ...defaultPolaroidSettings, size: 220 } }));
    expect(big.height).toBeGreaterThan(measurePolaroid(makeInput()).height);
  });
});

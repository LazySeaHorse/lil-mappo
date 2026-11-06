import { describe, it, expect } from 'vitest';
import type { GroupNode, ImageNode, PathNode, SceneNode, StyleRenderInput, TextNode } from '../types';
import { collectSceneAssets } from '../draw';
import {
  defaultPhotoPinSettings,
  measurePhotoPin,
  photoPinStyle,
  renderPhotoPin,
  type PhotoPinSettings,
} from './photo-pin';
import { pinPath } from './pinDrop';

const SRC = 'https://example.com/photo.jpg';

function makeInput(overrides: Partial<StyleRenderInput<PhotoPinSettings>> = {}): StyleRenderInput<PhotoPinSettings> {
  return {
    content: { title: 'Lisbon', image: SRC },
    settings: { ...defaultPhotoPinSettings },
    phase: 'visible',
    phaseProgress: 1,
    ground: { x: 0, y: 0 },
    itemTime: 3,
    playheadTime: 3,
    pixelRatio: 1,
    ...overrides,
  };
}

const enter = (progress: number, overrides: Partial<StyleRenderInput<PhotoPinSettings>> = {}) =>
  renderPhotoPin(makeInput({ phase: 'enter', phaseProgress: progress, ...overrides }));
const withSettings = (settings: Partial<PhotoPinSettings>, content = { title: 'Lisbon', image: SRC }) =>
  renderPhotoPin(makeInput({ settings: { ...defaultPhotoPinSettings, ...settings }, content }));

function flatten(node: SceneNode): SceneNode[] {
  return node.type === 'group' ? [node, ...node.children.flatMap(flatten)] : [node];
}
const texts = (scene: SceneNode) => flatten(scene).filter((n): n is TextNode => n.type === 'text');
const images = (scene: SceneNode) => flatten(scene).filter((n): n is ImageNode => n.type === 'image');
const pins = (scene: SceneNode) => flatten(scene).filter((n): n is PathNode => n.type === 'path' && n.d.includes('A'));
/** The group the pin falls and squashes in. */
const body = (scene: SceneNode) =>
  flatten(scene).find((n): n is GroupNode => n.type === 'group' && n.scaleX !== undefined && n.anchorY === 0);

describe('photoPinStyle definition', () => {
  it('is a self-animating media style that stands on its point', () => {
    expect(photoPinStyle).toMatchObject({
      id: 'photo-pin',
      category: 'media',
      contentSlots: ['title', 'image'],
      supportsAltitude: false,
      defaultOffset: [0, 0],
      drawsConnector: false,
      defaultTransition: { enter: 'auto', exit: 'auto' },
    });
    expect(photoPinStyle.controls.map((c) => c.key).sort()).toEqual(Object.keys(defaultPhotoPinSettings).sort());
  });
});

describe('pinPath', () => {
  it('starts at the tip and wraps the head with a large arc', () => {
    expect(pinPath(40, -70)).toMatch(/^M0 0L-[\d.]+ -[\d.]+A40\.00 40\.00 0 1 1 [\d.]+ -[\d.]+Z$/);
  });
});

describe('photo pin finished state', () => {
  it('draws the photo as a disc in the head, above the tip at the point', () => {
    const scene = renderPhotoPin(makeInput());
    const [photo] = images(scene);
    expect(photo).toMatchObject({ src: SRC, objectFit: 'cover' });
    expect(photo.width).toBe(photo.height);
    expect(photo.cornerRadius).toBe(photo.width / 2);
    // Centred over the tip, above the ground.
    expect(photo.x + photo.width / 2).toBeCloseTo(0);
    expect(photo.y + photo.height).toBeLessThan(0);
    expect(collectSceneAssets(scene).images).toContain(SRC);
  });

  it('fills the pin with its colour and keeps a rim of it round the photo', () => {
    const scene = withSettings({ pinColor: '#123456' });
    expect(pins(scene)[0].fill).toBe('#123456');
    const [photo] = images(scene);
    expect(photo.width / 2).toBeLessThan(defaultPhotoPinSettings.size / 2);
  });

  it('shows a placeholder without a photo', () => {
    const scene = withSettings({}, { title: 'Lisbon', image: '' });
    expect(images(scene)).toHaveLength(0);
    expect(flatten(scene).filter((n) => n.type === 'circle').length).toBeGreaterThan(1);
  });

  it('puts the title beside the head, right by default and left when asked, or hides it', () => {
    const [right] = texts(renderPhotoPin(makeInput()));
    expect(right).toMatchObject({ text: 'Lisbon', align: 'left' });
    expect(right.x).toBeGreaterThan(defaultPhotoPinSettings.size / 2);
    const [left] = texts(withSettings({ side: 'left' }));
    expect(left.align).toBe('right');
    expect(left.x).toBeLessThan(-defaultPhotoPinSettings.size / 2);
    expect(texts(withSettings({ showTitle: false }))).toHaveLength(0);
  });

  it('grows with size', () => {
    const small = images(withSettings({ size: 60 }))[0];
    const big = images(withSettings({ size: 140 }))[0];
    expect(big.width).toBeGreaterThan(small.width * 2);
  });

  it('removes the shadows when halo is off', () => {
    const shadowed = flatten(withSettings({ halo: false })).filter((n) => 'shadow' in n && n.shadow);
    expect(shadowed).toHaveLength(0);
  });

  it('measures room for the fall above the head', () => {
    const bounds = measurePhotoPin(makeInput());
    const [photo] = images(renderPhotoPin(makeInput()));
    expect(bounds.y).toBeLessThan(photo.y - 60);
    expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(0);
  });
});

describe('photo pin entrance', () => {
  it('drops the pin from above before the photo opens', () => {
    const early = enter(0.2);
    expect(body(early)!.y).toBeLessThan(0);
    expect(images(early)).toHaveLength(0);
    expect(body(enter(1))!.y).toBeCloseTo(0);
  });

  it('squashes the pin as it lands', () => {
    const landing = body(enter(0.52))!;
    expect(landing.scaleX).toBeGreaterThan(1);
    expect(landing.scaleY).toBeLessThan(1);
  });

  it('pops the photo open, then slides the title out', () => {
    expect(images(enter(0.6))).toHaveLength(1);
    expect(texts(enter(0.6))).toHaveLength(0);
    const sliding = texts(enter(0.8))[0];
    expect(sliding.opacity).toBeLessThan(1);
    expect(sliding.x).toBeLessThan(texts(enter(1))[0].x);
  });

  it('plays the exit as the entrance reversed', () => {
    expect(renderPhotoPin(makeInput({ phase: 'exit', phaseProgress: 0.4 }))).toEqual(enter(0.6));
  });
});

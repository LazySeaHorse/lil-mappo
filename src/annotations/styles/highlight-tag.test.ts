import { describe, it, expect } from 'vitest';
import type { GroupNode, RectNode, SceneNode, StyleRenderInput, TextNode } from '../types';
import {
  defaultHighlightTagSettings,
  highlightTagStyle,
  measureHighlightTag,
  renderHighlightTag,
  type HighlightTagSettings,
} from './highlight-tag';

function makeInput(overrides: Partial<StyleRenderInput<HighlightTagSettings>> = {}): StyleRenderInput<HighlightTagSettings> {
  return {
    content: { title: 'Malaysia', subtitle: 'Peninsular' },
    settings: { ...defaultHighlightTagSettings },
    phase: 'visible',
    phaseProgress: 1,
    ground: { x: 0, y: 0 },
    itemTime: 3,
    playheadTime: 3,
    pixelRatio: 1,
    ...overrides,
  };
}

const enter = (progress: number, overrides: Partial<StyleRenderInput<HighlightTagSettings>> = {}) =>
  renderHighlightTag(makeInput({ phase: 'enter', phaseProgress: progress, ...overrides }));

function flatten(node: SceneNode): SceneNode[] {
  return node.type === 'group' ? [node, ...node.children.flatMap(flatten)] : [node];
}
const texts = (s: SceneNode) => flatten(s).filter((n): n is TextNode => n.type === 'text');
const rects = (s: SceneNode) => flatten(s).filter((n): n is RectNode => n.type === 'rect');
const clips = (s: SceneNode) => flatten(s).filter((n): n is GroupNode => n.type === 'group' && n.clip !== undefined);

describe('highlightTagStyle definition', () => {
  it('is a self-animating label set on the point, with no connector', () => {
    expect(highlightTagStyle).toMatchObject({
      id: 'highlight-tag',
      category: 'label',
      supportsAltitude: false,
      defaultAnchor: 'center',
      defaultTransition: { enter: 'auto', exit: 'auto' },
    });
    expect(highlightTagStyle.drawsConnector).toBeFalsy();
  });

  it('has a control per setting', () => {
    expect(highlightTagStyle.controls.map((c) => c.key).sort()).toEqual(Object.keys(defaultHighlightTagSettings).sort());
  });
});

describe('highlight tag choreography', () => {
  it('draws nothing at progress 0', () => {
    expect(flatten(enter(0)).filter((n) => n.type !== 'group')).toHaveLength(0);
  });

  it('wipes the title box open from its left edge, with the text not yet shown', () => {
    const early = rects(enter(0.1))[0];
    const later = rects(enter(0.3))[0];
    const full = rects(renderHighlightTag(makeInput()))[0];
    expect(early.width).toBeGreaterThan(0);
    expect(early.width).toBeLessThan(later.width);
    expect(later.width).toBeLessThan(full.width);
    expect(later.x).toBe(full.x);
    expect(texts(enter(0.1))).toHaveLength(0);
  });

  it('raises the text into its box from below, clipped to the open part of the box', () => {
    const scene = enter(0.4);
    const [title] = texts(scene);
    const box = rects(scene)[0];
    expect(title.y).toBeGreaterThan(box.y + box.height / 2);
    expect(clips(scene)[0].clip).toMatchObject({ x: box.x, y: box.y, width: box.width, height: box.height });
    expect(texts(renderHighlightTag(makeInput()))[0].y).toBe(box.y + box.height / 2);
  });

  it('brings the subtitle box in after the title box', () => {
    expect(rects(enter(0.45))).toHaveLength(1);
    expect(rects(enter(0.7))).toHaveLength(2);
  });

  it('plays the exit as the entrance reversed', () => {
    expect(renderHighlightTag(makeInput({ phase: 'exit', phaseProgress: 0.4 }))).toEqual(enter(0.6));
  });
});

describe('highlight tag layout and settings', () => {
  it('fills the title box with the tag color and the subtitle box with the text color, swapping the lettering', () => {
    const scene = renderHighlightTag(makeInput());
    const [title, subtitle] = rects(scene);
    expect(title.fill).toBe('#FFE600');
    expect(subtitle.fill).toBe('#1A1A1A');
    const [titleText, subtitleText] = texts(scene);
    expect(titleText.fill).toBe('#1A1A1A');
    expect(subtitleText.fill).toBe('#FFE600');
  });

  it('sizes the box to the title, and stacks the subtitle box under it, left aligned', () => {
    const width = (title: string) => rects(renderHighlightTag(makeInput({ content: { title } })))[0].width;
    expect(width('A much longer place name')).toBeGreaterThan(width('Oslo'));
    const [title, subtitle] = rects(renderHighlightTag(makeInput()));
    expect(subtitle.y).toBeGreaterThan(title.y + title.height);
    expect(subtitle.x).toBe(title.x);
  });

  it('draws only the box it has text for, centred on the origin', () => {
    const only = rects(renderHighlightTag(makeInput({ content: { title: '', subtitle: 'Only a subtitle' } })));
    expect(only).toHaveLength(1);
    expect(only[0].y + only[0].height / 2).toBeCloseTo(0, 5);
    expect(flatten(renderHighlightTag(makeInput({ content: { title: '' } }))).filter((n) => n.type !== 'group')).toHaveLength(0);
  });

  it('puts a shadow on the boxes only while Soft shadow is on', () => {
    expect(rects(renderHighlightTag(makeInput()))[0].shadow).toBeDefined();
    const off = renderHighlightTag(makeInput({ settings: { ...defaultHighlightTagSettings, halo: false } }));
    expect(rects(off)[0].shadow).toBeUndefined();
  });

  it('measures room for the shadow only when it is on', () => {
    const on = measureHighlightTag(makeInput());
    const off = measureHighlightTag(makeInput({ settings: { ...defaultHighlightTagSettings, halo: false } }));
    expect(on.width).toBeGreaterThan(off.width);
  });
});

import { describe, it, expect } from 'vitest';
import type { GroupNode, PathNode, PolylineNode, RectNode, SceneNode, StyleRenderInput, TextNode } from '../types';
import {
  defaultRoadSignSettings,
  measureRoadSign,
  renderRoadSign,
  resolvePostCount,
  roadSignSettingsSchema,
  roadSignStyle,
  type RoadSignSettings,
} from './road-sign';

const GROUND = { x: 0, y: 70 };

function makeInput(overrides: Partial<StyleRenderInput<RoadSignSettings>> = {}): StyleRenderInput<RoadSignSettings> {
  return {
    content: { title: 'Golden Gate Bridge', subtitle: 'San Francisco 2 mi', badge: '101' },
    settings: { ...defaultRoadSignSettings },
    phase: 'visible',
    phaseProgress: 1,
    ground: GROUND,
    itemTime: 3,
    playheadTime: 3,
    pixelRatio: 1,
    ...overrides,
  };
}

const enter = (progress: number, overrides: Partial<StyleRenderInput<RoadSignSettings>> = {}) =>
  renderRoadSign(makeInput({ phase: 'enter', phaseProgress: progress, ...overrides }));

function flatten(node: SceneNode): SceneNode[] {
  return node.type === 'group' ? [node, ...node.children.flatMap(flatten)] : [node];
}
const texts = (s: SceneNode) => flatten(s).filter((n): n is TextNode => n.type === 'text');
const paths = (s: SceneNode) => flatten(s).filter((n): n is PathNode => n.type === 'path');
const rects = (s: SceneNode) => flatten(s).filter((n): n is RectNode => n.type === 'rect');
const posts = (s: SceneNode) => flatten(s).filter((n): n is PolylineNode => n.type === 'polyline' && !n.closed && n.strokeWidth === 5);
const flips = (s: SceneNode) => flatten(s).filter((n): n is GroupNode => n.type === 'group' && n.scaleY !== undefined);

describe('roadSignStyle definition', () => {
  it('is a self-animating sign that draws its own posts', () => {
    expect(roadSignStyle).toMatchObject({
      id: 'road-sign',
      category: 'sign',
      icon: 'signpost',
      drawsConnector: true,
      defaultAltitude: 70,
      defaultOffset: [0, 0],
      defaultTransition: { enter: 'auto', exit: 'auto', enterDuration: 1.1 },
    });
    expect(roadSignStyle.contentSlots).toContain('badge');
  });

  it('has a control per setting', () => {
    expect(roadSignStyle.controls.map((c) => c.key).sort()).toEqual(Object.keys(defaultRoadSignSettings).sort());
    expect(roadSignSettingsSchema.parse({})).toEqual(defaultRoadSignSettings);
  });
});

describe('road sign choreography', () => {
  it('draws nothing at progress 0', () => {
    expect(flatten(enter(0)).filter((n) => n.type !== 'group')).toHaveLength(0);
  });

  it('raises the posts before the panel appears', () => {
    const scene = enter(0.2);
    expect(posts(scene).length).toBe(2);
    expect(posts(scene)[0].progress).toBeGreaterThan(0);
    expect(rects(scene)).toHaveLength(0);
  });

  it('flips the panel up about its bottom edge, overshooting on the way', () => {
    const scaleAt = (p: number) => flips(enter(p))[0]?.scaleY ?? 0;
    expect(scaleAt(0.4)).toBeGreaterThan(0);
    expect(scaleAt(0.4)).toBeLessThan(1);
    expect(Math.max(...[0.5, 0.55, 0.6, 0.65].map(scaleAt))).toBeGreaterThan(1);
    expect(scaleAt(1)).toBe(1);
    // The panel's bottom edge is the group's origin, so it stays planted.
    const panel = rects(enter(0.4))[0];
    expect(panel.y + panel.height).toBe(0);
  });

  it('has the panel up but the text not yet written at 55%', () => {
    const scene = enter(0.55);
    expect(rects(scene).length).toBeGreaterThan(0);
    expect(texts(scene)).toHaveLength(0);
  });

  it('shows the title and shield before the subtitle', () => {
    const scene = enter(0.76);
    expect(texts(scene).map((t) => t.text)).toContain('Golden Gate Bridge');
    expect(texts(scene).map((t) => t.text)).not.toContain('San Francisco 2 mi');
    expect(paths(scene).length).toBeGreaterThan(0);
  });

  it('plays the exit as the entrance reversed', () => {
    expect(renderRoadSign(makeInput({ phase: 'exit', phaseProgress: 0.4 }))).toEqual(enter(0.6));
  });
});

describe('road sign layout and settings', () => {
  it('draws one or two posts, ending on the ground point', () => {
    const one = posts(renderRoadSign(makeInput({ settings: { ...defaultRoadSignSettings, posts: 1 } })));
    expect(one).toHaveLength(1);
    expect(one[0].points[0]).toEqual([0, 70]);
    expect(posts(renderRoadSign(makeInput()))).toHaveLength(2);
    expect(resolvePostCount(5)).toBe(2);
    expect(resolvePostCount(0)).toBe(1);
  });

  it('shows the shield only with a badge and a shield setting', () => {
    const shieldTexts = (input: StyleRenderInput<RoadSignSettings>) => texts(renderRoadSign(input)).map((t) => t.text);
    expect(shieldTexts(makeInput())).toContain('101');
    expect(shieldTexts(makeInput({ content: { title: 'Exit' } }))).not.toContain('101');
    expect(shieldTexts(makeInput({ settings: { ...defaultRoadSignSettings, shield: 'none' } }))).not.toContain('101');
  });

  it('uses a blue and red path shield for interstate and a white disc for circle', () => {
    expect(paths(renderRoadSign(makeInput())).map((p) => p.fill).filter(Boolean)).toEqual(['#1F4FA3', '#C8102E']);
    const circle = renderRoadSign(makeInput({ settings: { ...defaultRoadSignSettings, shield: 'circle' } }));
    expect(paths(circle)).toHaveLength(0);
    expect(flatten(circle).some((n) => n.type === 'circle' && n.fill === '#FFFFFF')).toBe(true);
  });

  it('sizes the panel to the text and makes room for the shield', () => {
    const width = (input: StyleRenderInput<RoadSignSettings>) => rects(renderRoadSign(input))[0].width;
    expect(width(makeInput({ content: { title: 'A considerably longer sign title' } }))).toBeGreaterThan(width(makeInput({ content: { title: 'Exit' } })));
    const withShield = width(makeInput({ content: { title: 'Exit 12', badge: '9' } }));
    const without = width(makeInput({ content: { title: 'Exit 12' } }));
    expect(withShield).toBeGreaterThanOrEqual(without);
  });

  it('makes the panel taller with a subtitle, and honours colours', () => {
    const panel = (input: StyleRenderInput<RoadSignSettings>) => rects(renderRoadSign(input))[0];
    expect(panel(makeInput()).height).toBeGreaterThan(panel(makeInput({ content: { title: 'Golden Gate Bridge' } })).height);
    expect(panel(makeInput({ settings: { ...defaultRoadSignSettings, signColor: '#123456' } })).fill).toBe('#123456');
    expect(texts(renderRoadSign(makeInput({ settings: { ...defaultRoadSignSettings, textColor: '#abcdef' } })))[0].fill).toBeDefined();
  });

  it('measures the panel, its posts and the flip overshoot', () => {
    const bounds = measureRoadSign(makeInput());
    const panel = rects(renderRoadSign(makeInput()))[0];
    expect(bounds.y).toBeLessThan(panel.y);
    expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(70);
  });
});

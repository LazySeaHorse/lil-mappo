import { describe, it, expect } from 'vitest';
import type { CircleNode, GroupNode, SceneNode, StyleRenderInput, TextNode } from '../types';
import {
  dashPattern,
  defaultRadiusRingSettings,
  measureRadiusRing,
  radiusRingSettingsSchema,
  radiusRingStyle,
  renderRadiusRing,
  type RadiusRingSettings,
} from './radius-ring';

function makeInput(overrides: Partial<StyleRenderInput<RadiusRingSettings>> = {}): StyleRenderInput<RadiusRingSettings> {
  return {
    content: { title: 'Blast radius', subtitle: '5 km' },
    settings: { ...defaultRadiusRingSettings },
    phase: 'visible',
    phaseProgress: 1,
    ground: { x: 0, y: 0 },
    itemTime: 3,
    playheadTime: 3,
    pixelRatio: 1,
    ...overrides,
  };
}

const enter = (progress: number, overrides: Partial<StyleRenderInput<RadiusRingSettings>> = {}) =>
  renderRadiusRing(makeInput({ phase: 'enter', phaseProgress: progress, ...overrides }));
const withSettings = (settings: Partial<RadiusRingSettings>) => ({ settings: { ...defaultRadiusRingSettings, ...settings } });

function flatten(node: SceneNode): SceneNode[] {
  return node.type === 'group' ? [node, ...node.children.flatMap(flatten)] : [node];
}
const texts = (scene: SceneNode) => flatten(scene).filter((n): n is TextNode => n.type === 'text');
const circles = (scene: SceneNode) => flatten(scene).filter((n): n is CircleNode => n.type === 'circle');
const ring = (scene: SceneNode) => circles(scene).find((c) => c.startAngle !== undefined);
/** Letters as (group, text) pairs: each is a rotated group with one character. */
const letters = (scene: SceneNode) =>
  flatten(scene).filter((n): n is GroupNode => n.type === 'group' && n.children.length === 1 && n.children[0].type === 'text' && n.rotation !== undefined);

describe('radiusRingStyle definition', () => {
  it('is a centred marker with no connector or altitude', () => {
    expect(radiusRingStyle).toMatchObject({
      id: 'radius-ring',
      category: 'marker',
      icon: 'circle-dashed',
      supportsAltitude: false,
      drawsConnector: false,
      defaultAnchor: 'center',
      defaultOffset: [0, 0],
      defaultTransition: { enter: 'auto', exit: 'auto', enterDuration: 1.3 },
    });
    expect(radiusRingStyle.controls.map((c) => c.key).sort()).toEqual(Object.keys(defaultRadiusRingSettings).sort());
  });

  it('fills defaults', () => {
    expect(radiusRingSettingsSchema.parse({})).toEqual(defaultRadiusRingSettings);
    expect(defaultRadiusRingSettings.radius).toBe(70);
  });
});

describe('layout', () => {
  it('draws a dashed ring of the set radius round a centre dot', () => {
    const scene = renderRadiusRing(makeInput());
    expect(ring(scene)).toMatchObject({ r: 70, stroke: '#FFFFFF' });
    expect(ring(scene)!.dashPattern).toEqual(dashPattern(70));
    const dot = circles(scene).find((c) => c.fill === '#FF5A36');
    expect(dot).toMatchObject({ cx: 0, cy: 0 });
  });

  it('closes the dashes evenly round the ring', () => {
    for (const radius of [30, 70, 143, 200]) {
      const [dash, gap] = dashPattern(radius);
      expect(((Math.PI * 2 * radius) / (dash + gap)) % 1).toBeCloseTo(0, 6);
    }
  });

  it('sets the title on the top of the ring and the subtitle along the bottom', () => {
    const scene = renderRadiusRing(makeInput());
    const all = texts(scene);
    expect(all.map((t) => t.text).join('')).toBe('BLASTRADIUS5KM');
    expect(all[0]).toMatchObject({ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 13, align: 'center' });
    const groups = letters(scene);
    const title = groups.filter((g) => g.y! < 0);
    const subtitle = groups.filter((g) => g.y! > 0);
    expect(title).toHaveLength(11);
    expect(subtitle).toHaveLength(3);
    // The bottom text stands upright: its letters are turned less than a quarter, not upside down.
    expect(subtitle.every((g) => Math.abs(Math.cos(g.rotation!)) > 0.5)).toBe(true);
  });

  it('omits the subtitle when empty', () => {
    const scene = renderRadiusRing(makeInput({ content: { title: 'Solo' } }));
    expect(letters(scene).every((g) => g.y! < 0)).toBe(true);
  });

  it('keeps long lettering within the arc by shrinking it', () => {
    const size = (title: string) => texts(renderRadiusRing(makeInput({ ...withSettings({ radius: 40 }), content: { title } })))[0].fontSize;
    expect(size('An exceedingly long evacuation zone name')).toBeLessThan(size('Rome'));
  });
});

describe('settings', () => {
  it('draws a solid ring when not dashed', () => {
    expect(ring(renderRadiusRing(makeInput(withSettings({ dashed: false }))))!.dashPattern).toBeUndefined();
  });

  it('toggles the faint fill', () => {
    const filled = circles(renderRadiusRing(makeInput())).find((c) => c.fill === '#FFFFFF');
    expect(filled?.opacity).toBeLessThan(0.2);
    expect(circles(renderRadiusRing(makeInput(withSettings({ fill: false })))).some((c) => c.fill === '#FFFFFF')).toBe(false);
  });

  it('applies colours, radius and halo', () => {
    const scene = renderRadiusRing(makeInput(withSettings({ ringColor: '#00ff00', accentColor: '#0000ff', radius: 100, halo: false })));
    expect(ring(scene)).toMatchObject({ r: 100, stroke: '#00ff00' });
    expect(circles(scene).some((c) => c.fill === '#0000ff')).toBe(true);
    expect(texts(scene).every((t) => t.fill === '#00ff00' && !t.shadow)).toBe(true);
    expect(texts(renderRadiusRing(makeInput())).every((t) => t.shadow)).toBe(true);
  });

  it('spins the dashes with time only when asked, and only when dashed', () => {
    const turn = (settings: Partial<RadiusRingSettings>, itemTime: number) => {
      const scene = renderRadiusRing(makeInput({ ...withSettings(settings), itemTime }));
      return flatten(scene).find((n): n is GroupNode => n.type === 'group' && n.children[0]?.type === 'circle' && (n.children[0] as CircleNode).startAngle !== undefined)!.rotation;
    };
    expect(turn({ spin: true }, 1)).not.toBe(turn({ spin: true }, 2));
    expect(turn({}, 1)).toBe(turn({}, 2));
    expect(turn({ spin: true, dashed: false }, 1)).toBe(0);
  });
});

describe('choreography', () => {
  it('draws nothing at progress 0', () => {
    expect(flatten(enter(0)).filter((n) => n.type !== 'group')).toHaveLength(0);
  });

  it('has the dot up and the ring part-drawn at 25%, with no lettering yet', () => {
    const scene = enter(0.25);
    expect(circles(scene).some((c) => c.fill === '#FF5A36')).toBe(true);
    const drawn = ring(scene)!;
    const sweep = (drawn.endAngle! - drawn.startAngle!) / (Math.PI * 2);
    expect(sweep).toBeGreaterThan(0);
    expect(sweep).toBeLessThan(1);
    expect(texts(scene)).toHaveLength(0);
  });

  it('has the ring closed and the fill fading in at 60%, with the first letters arriving', () => {
    const scene = enter(0.6);
    const drawn = ring(scene)!;
    expect(drawn.endAngle! - drawn.startAngle!).toBeCloseTo(Math.PI * 2);
    const fill = circles(scene).find((c) => c.fill === '#FFFFFF')!;
    expect(fill.opacity).toBeGreaterThan(0);
    expect(texts(scene).length).toBeGreaterThan(0);
    expect(texts(scene).length).toBeLessThan(14);
  });

  it('staggers the letters left to right', () => {
    const opacities = letters(enter(0.7)).filter((g) => g.y! < 0).map((g) => g.opacity ?? 1);
    expect(opacities[0]).toBeGreaterThan(opacities[opacities.length - 1] ?? 0);
  });

  it('draws the ring on from the top', () => {
    expect(ring(enter(0.3))!.startAngle).toBeCloseTo(-Math.PI / 2);
  });
});

describe('measure', () => {
  it('covers the ring and the lettering round it, centred on the point', () => {
    const bounds = measureRadiusRing(makeInput());
    expect(bounds.width).toBeGreaterThan(140);
    expect(bounds.y).toBeLessThanOrEqual(-70 - 11);
    expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(70 + 11);
    expect(measureRadiusRing(makeInput({ phase: 'enter', phaseProgress: 0 }))).toEqual(bounds);
  });

  it('grows with the radius', () => {
    expect(measureRadiusRing(makeInput(withSettings({ radius: 150 }))).width).toBeGreaterThan(measureRadiusRing(makeInput()).width);
  });
});

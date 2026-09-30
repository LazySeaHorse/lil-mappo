import { describe, it, expect } from 'vitest';
import type { GroupNode, PathNode, PolylineNode, SceneNode, StyleRenderInput, TextNode } from '../types';
import { defaultFlagSettings, flagSettingsSchema, flagStyle, measureFlag, renderFlag, type FlagSettings } from './flag';

const GROUND = { x: 0, y: 90 };

function makeInput(overrides: Partial<StyleRenderInput<FlagSettings>> = {}): StyleRenderInput<FlagSettings> {
  return {
    content: { title: 'Base Camp', subtitle: 'Elevation 5,364 m' },
    settings: { ...defaultFlagSettings },
    phase: 'visible',
    phaseProgress: 1,
    ground: GROUND,
    itemTime: 3,
    playheadTime: 3,
    pixelRatio: 1,
    ...overrides,
  };
}

const enter = (progress: number, overrides: Partial<StyleRenderInput<FlagSettings>> = {}) =>
  renderFlag(makeInput({ phase: 'enter', phaseProgress: progress, ...overrides }));

function flatten(node: SceneNode): SceneNode[] {
  return node.type === 'group' ? [node, ...node.children.flatMap(flatten)] : [node];
}
const texts = (s: SceneNode) => flatten(s).filter((n): n is TextNode => n.type === 'text');
const paths = (s: SceneNode) => flatten(s).filter((n): n is PathNode => n.type === 'path');
const poles = (s: SceneNode) => flatten(s).filter((n): n is PolylineNode => n.type === 'polyline' && !n.closed);

describe('flagStyle definition', () => {
  it('is a self-animating marker that draws its pole', () => {
    expect(flagStyle).toMatchObject({
      id: 'flag',
      category: 'marker',
      icon: 'flag',
      drawsConnector: true,
      defaultOffset: [0, 0],
      defaultAltitude: 90,
      defaultTransition: { enter: 'auto', exit: 'auto', enterDuration: 1.4 },
    });
  });

  it('has a control per setting', () => {
    expect(flagStyle.controls.map((c) => c.key).sort()).toEqual(Object.keys(defaultFlagSettings).sort());
    expect(flagSettingsSchema.parse({})).toEqual(defaultFlagSettings);
  });
});

describe('flag choreography', () => {
  it('draws nothing at progress 0', () => {
    const scene = enter(0);
    expect(paths(scene)).toHaveLength(0);
    expect(poles(scene)).toHaveLength(0);
    expect(texts(scene)).toHaveLength(0);
  });

  it('grows the pole before the cloth and title appear', () => {
    const scene = enter(0.2);
    const [pole] = poles(scene);
    expect(pole.progress).toBeGreaterThan(0);
    expect(pole.progress).toBeLessThan(1);
    expect(texts(scene)).toHaveLength(0);
    // Only the base shadow is a path: no cloth yet.
    expect(paths(scene).every((p) => p.fill === 'rgba(0, 0, 0, 0.4)')).toBe(true);
  });

  it('has the cloth open but the subtitle still hidden at 60%', () => {
    const scene = enter(0.6);
    expect(paths(scene).some((p) => p.fill === defaultFlagSettings.clothColor)).toBe(true);
    expect(texts(scene).map((t) => t.text)).toEqual(['BASE CAMP']);
  });

  it('shows the subtitle by the end', () => {
    expect(texts(enter(1)).map((t) => t.text)).toEqual(['BASE CAMP', 'Elevation 5,364 m']);
  });

  it('plays the exit as the entrance reversed', () => {
    expect(renderFlag(makeInput({ phase: 'exit', phaseProgress: 0.6 }))).toEqual(enter(0.4));
  });
});

describe('flag layout and settings', () => {
  it('stands a minimum-height pole when the origin sits on the ground', () => {
    const [pole] = poles(renderFlag(makeInput({ ground: { x: 0, y: 0 } })));
    const top = pole.points[1];
    expect(top[1]).toBeLessThan(-40);
  });

  it('omits the subtitle when there is none', () => {
    expect(texts(renderFlag(makeInput({ content: { title: 'Summit' } }))).map((t) => t.text)).toEqual(['SUMMIT']);
  });

  it('gives each shape a different cloth outline', () => {
    const outline = (shape: FlagSettings['shape']) =>
      paths(renderFlag(makeInput({ settings: { ...defaultFlagSettings, shape } }))).find((p) => p.fill === defaultFlagSettings.clothColor)!.d;
    expect(new Set([outline('rect'), outline('swallowtail'), outline('pennant')]).size).toBe(3);
  });

  it('ripples over time only when wave is on', () => {
    const at = (wave: boolean, itemTime: number) => renderFlag(makeInput({ settings: { ...defaultFlagSettings, wave }, itemTime }));
    expect(at(true, 1)).not.toEqual(at(true, 1.4));
    expect(at(false, 1)).toEqual(at(false, 1.4));
  });

  it('applies cloth and text colors', () => {
    const scene = renderFlag(makeInput({ settings: { ...defaultFlagSettings, clothColor: '#123456', textColor: '#abcdef' } }));
    expect(paths(scene).some((p) => p.fill === '#123456')).toBe(true);
    expect(texts(scene)[0].fill).toBe('#abcdef');
  });

  it('measures a box that widens with the title', () => {
    const wide = measureFlag(makeInput({ content: { title: 'A much longer flag title' } }));
    expect(wide.width).toBeGreaterThan(measureFlag(makeInput({ content: { title: 'Hi' } })).width);
  });

  it('tilts the title with the cloth as a group rotation', () => {
    const rotated = flatten(renderFlag(makeInput())).filter((n): n is GroupNode => n.type === 'group' && n.rotation !== undefined);
    expect(rotated.length).toBeGreaterThan(0);
  });
});

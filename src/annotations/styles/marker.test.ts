import { describe, it, expect } from 'vitest';
import type { GroupNode, PathNode, SceneNode, StyleRenderInput, TextNode } from '../types';
import { measureScene } from '../scene/measure';
import { defaultMarkerSettings, markerStyle, measureMarker, renderMarker, squarePinPath, type MarkerSettings } from './marker';

function makeInput(overrides: Partial<StyleRenderInput<MarkerSettings>> = {}): StyleRenderInput<MarkerSettings> {
  return {
    content: { title: '12', subtitle: 'km' },
    settings: { ...defaultMarkerSettings },
    phase: 'visible',
    phaseProgress: 1,
    ground: { x: 0, y: 0 },
    itemTime: 3,
    playheadTime: 3,
    pixelRatio: 1,
    ...overrides,
  };
}

const withSettings = (settings: Partial<MarkerSettings>, content: StyleRenderInput['content'] = { title: '12', subtitle: 'km' }) =>
  renderMarker(makeInput({ settings: { ...defaultMarkerSettings, ...settings }, content }));
const enter = (progress: number) => renderMarker(makeInput({ phase: 'enter', phaseProgress: progress }));

function flatten(node: SceneNode): SceneNode[] {
  return node.type === 'group' ? [node, ...node.children.flatMap(flatten)] : [node];
}
const texts = (scene: SceneNode) => flatten(scene).filter((n): n is TextNode => n.type === 'text');
const textNamed = (scene: SceneNode, name: string) => texts(scene).find((t) => t.text === name)!;
/** The group the pin falls and squashes in. */
const dropper = (scene: SceneNode) =>
  flatten(scene).find((n): n is GroupNode => n.type === 'group' && n.scaleX !== undefined && n.anchorY === 0);

describe('markerStyle definition', () => {
  it('is a self-animating marker that stands on its point', () => {
    expect(markerStyle).toMatchObject({
      id: 'marker',
      category: 'marker',
      contentSlots: ['title', 'subtitle'],
      supportsAltitude: false,
      defaultOffset: [0, 0],
      drawsConnector: false,
      defaultTransition: { enter: 'auto', exit: 'auto' },
    });
    expect(markerStyle.controls.map((c) => c.key).sort()).toEqual(Object.keys(defaultMarkerSettings).sort());
  });
});

describe('marker finished state', () => {
  it('stacks the subtitle over the title by default, each in its colour', () => {
    const scene = renderMarker(makeInput());
    const title = textNamed(scene, '12');
    const subtitle = textNamed(scene, 'km');
    expect(subtitle.y).toBeLessThan(title.y);
    expect(title.fontSize).toBeGreaterThan(subtitle.fontSize);
    expect(title.fill).toBe(defaultMarkerSettings.titleColor);
    expect(subtitle.fill).toBe(defaultMarkerSettings.subtitleColor);
    expect(title.x).toBe(0);
  });

  it('puts the subtitle below the title when asked', () => {
    const scene = withSettings({ subtitlePosition: 'below' });
    expect(textNamed(scene, 'km').y).toBeGreaterThan(textNamed(scene, '12').y);
  });

  it('centres a lone title in the head, and draws nothing for no text', () => {
    const lone = withSettings({}, { title: 'AP2' });
    expect(texts(lone)).toHaveLength(1);
    // The default head is 72 wide, its centre 1.75 radii above the tip.
    expect(textNamed(lone, 'AP2').y).toBeCloseTo(-36 * 1.75);
    expect(texts(withSettings({}, { title: '' }))).toHaveLength(0);
  });

  it('writes a lone title larger than a title with a subtitle', () => {
    expect(textNamed(withSettings({}, { title: '12' }), '12').fontSize).toBeGreaterThan(textNamed(renderMarker(makeInput()), '12').fontSize);
  });

  it('shrinks a long title to fit the head', () => {
    const long = withSettings({}, { title: 'Harbour Bridge Sydney' });
    expect(textNamed(long, 'Harbour Bridge Sydney').fontSize).toBeLessThan(textNamed(withSettings({}, { title: '12' }), '12').fontSize / 2);
  });

  it('turns the text 45° up to the right only when tilted', () => {
    const rotation = (scene: SceneNode) => flatten(scene).find((n): n is GroupNode => n.type === 'group' && n.rotation !== undefined && n.rotation !== 0)?.rotation;
    expect(rotation(withSettings({}))).toBeUndefined();
    expect(rotation(withSettings({ tilt: true }))).toBeCloseTo(-Math.PI / 4);
  });

  it('draws the head and pointer as one path, round or square', () => {
    const round = flatten(withSettings({})).filter((n): n is PathNode => n.type === 'path');
    expect(round).toHaveLength(1);
    expect(round[0].d).toContain('A');
    const square = flatten(withSettings({ head: 'square' })).filter((n): n is PathNode => n.type === 'path');
    expect(square).toHaveLength(1);
    expect(square[0].d).toBe(squarePinPath(36 * 0.9, -(36 * 0.9 + 36 * 0.9 * 0.6)));
  });

  it('puts a head on a stick instead of a pointer', () => {
    const round = flatten(withSettings({ tail: 'stick' }));
    expect(round.filter((n) => n.type === 'path')).toHaveLength(0);
    expect(round.filter((n) => n.type === 'circle' && n.fill === defaultMarkerSettings.markerColor)).toHaveLength(1);
    expect(round.filter((n) => n.type === 'polyline')).toHaveLength(1);
    const square = flatten(withSettings({ tail: 'stick', head: 'square' }));
    expect(square.filter((n) => n.type === 'rect')).toHaveLength(1);
    expect(square.filter((n) => n.type === 'polyline')).toHaveLength(1);
  });

  it('paints the marker in its colour and grows with size', () => {
    const [pin] = flatten(withSettings({ markerColor: '#123456' })).filter((n): n is PathNode => n.type === 'path');
    expect(pin.fill).toBe('#123456');
    const small = measureMarker(makeInput({ settings: { ...defaultMarkerSettings, size: 60 } }));
    const big = measureMarker(makeInput({ settings: { ...defaultMarkerSettings, size: 140 } }));
    expect(big.width).toBeGreaterThan(small.width * 1.5);
  });

  it('removes the shadows when halo is off', () => {
    const shadowed = flatten(withSettings({ halo: false })).filter((n) => 'shadow' in n && n.shadow);
    expect(shadowed).toHaveLength(0);
  });
});

describe('squarePinPath', () => {
  it('starts at the tip and closes, with a rounded corner at each of the head’s four corners', () => {
    const d = squarePinPath(32, -50);
    expect(d).toMatch(/^M0 0L[\d.]+ -?[\d.]+/);
    expect(d.endsWith('Z')).toBe(true);
    expect(d.match(/A/g)).toHaveLength(4);
  });
});

describe('marker entrance', () => {
  it('drops the pin from above before the text opens', () => {
    const early = enter(0.2);
    expect(dropper(early)!.y).toBeLessThan(0);
    expect(texts(early)).toHaveLength(0);
    expect(dropper(enter(1))!.y).toBeCloseTo(0);
  });

  it('squashes the pin as it lands', () => {
    const landing = dropper(enter(0.52))!;
    expect(landing.scaleX).toBeGreaterThan(1);
    expect(landing.scaleY).toBeLessThan(1);
  });

  it('pops the text open inside the head after the landing', () => {
    expect(texts(enter(0.6)).length).toBeGreaterThan(0);
  });

  it('plays the exit as the entrance reversed', () => {
    expect(renderMarker(makeInput({ phase: 'exit', phaseProgress: 0.4 }))).toEqual(enter(0.6));
  });
});

describe('marker bounds', () => {
  it('contain every variant, with room for the fall above the head', () => {
    for (const head of ['circle', 'square'] as const) {
      for (const tail of ['pointer', 'stick'] as const) {
        for (const tilt of [false, true]) {
          const input = makeInput({ settings: { ...defaultMarkerSettings, head, tail, tilt } });
          const bounds = measureMarker(input);
          const drawn = measureScene(renderMarker(input));
          expect(bounds.x).toBeLessThanOrEqual(drawn.minX + 0.5);
          expect(bounds.y).toBeLessThanOrEqual(drawn.minY - 60);
          expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(drawn.maxX - 0.5);
          expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(drawn.maxY - 0.5);
        }
      }
    }
  });
});

import { describe, it, expect } from 'vitest';
import type { CircleNode, GroupNode, PolylineNode, SceneNode, StyleRenderInput, TextNode } from '../types';
import {
  defaultPinCalloutSettings,
  measurePinCallout,
  pinCalloutStyle,
  renderPinCallout,
  type PinCalloutSettings,
} from './pin-callout';

// Up and to the right of the pin, like the style's default offset (80, -90).
const GROUND = { x: -80, y: 90 };

function makeInput(overrides: Partial<StyleRenderInput<PinCalloutSettings>> = {}): StyleRenderInput<PinCalloutSettings> {
  return {
    content: { title: 'Oil', subtitle: 'Crude tankers' },
    settings: { ...defaultPinCalloutSettings },
    phase: 'visible',
    phaseProgress: 1,
    ground: GROUND,
    itemTime: 3,
    playheadTime: 3,
    pixelRatio: 1,
    ...overrides,
  };
}

const enter = (progress: number, overrides: Partial<StyleRenderInput<PinCalloutSettings>> = {}) =>
  renderPinCallout(makeInput({ phase: 'enter', phaseProgress: progress, ...overrides }));

function flatten(node: SceneNode): SceneNode[] {
  return node.type === 'group' ? [node, ...node.children.flatMap(flatten)] : [node];
}
const texts = (s: SceneNode) => flatten(s).filter((n): n is TextNode => n.type === 'text');
const circles = (s: SceneNode) => flatten(s).filter((n): n is CircleNode => n.type === 'circle');
const lines = (s: SceneNode) => flatten(s).filter((n): n is PolylineNode => n.type === 'polyline');
const rings = (s: SceneNode) => circles(s).filter((c) => c.r === 21 && c.endAngle !== undefined);
const dots = (s: SceneNode) => flatten(s).filter((n): n is GroupNode => n.type === 'group' && n.scale !== undefined);

describe('pinCalloutStyle definition', () => {
  it('is a self-animating label that draws its own connector from the point', () => {
    expect(pinCalloutStyle).toMatchObject({
      id: 'pin-callout',
      category: 'label',
      drawsConnector: true,
      defaultOffset: [80, -90],
      defaultTransition: { enter: 'auto', exit: 'auto' },
    });
  });

  it('has a control per setting', () => {
    expect(pinCalloutStyle.controls.map((c) => c.key).sort()).toEqual(Object.keys(defaultPinCalloutSettings).sort());
  });
});

describe('pin callout choreography', () => {
  it('draws nothing at progress 0', () => {
    expect(flatten(enter(0)).filter((n) => n.type !== 'group')).toHaveLength(0);
  });

  it('pops the pin in and draws its ring round it before the line starts', () => {
    const scene = enter(0.12);
    expect(dots(scene)[0].scale).toBeGreaterThan(0);
    const [ring] = rings(enter(0.2));
    expect(ring.endAngle! - ring.startAngle!).toBeGreaterThan(0);
    expect(ring.endAngle! - ring.startAngle!).toBeLessThan(Math.PI * 2);
    expect(lines(enter(0.12))).toHaveLength(0);
  });

  it('draws the connector on from the pin, then the shelf, then raises the title and fades in the subtitle', () => {
    const connector = (p: number) => lines(enter(p)).find((l) => l.points.length >= 2 && l.points[0][1] > 0)?.progress ?? 0;
    expect(connector(0.3)).toBeGreaterThan(0);
    expect(connector(0.3)).toBeLessThan(1);
    expect(lines(enter(0.4))).toHaveLength(1);
    expect(lines(enter(0.6))).toHaveLength(2);
    expect(texts(enter(0.55))).toHaveLength(0);
    expect(texts(enter(0.7)).map((t) => t.text)).toEqual(['OIL']);
    expect(texts(enter(1)).map((t) => t.text)).toEqual(['OIL', 'Crude tankers']);
  });

  it('plays the exit as the entrance reversed', () => {
    expect(renderPinCallout(makeInput({ phase: 'exit', phaseProgress: 0.4 }))).toEqual(enter(0.6));
  });
});

describe('pin callout layout and settings', () => {
  it('runs straight up from the pin, then at 45° into the shelf, starting at the edge of the ring', () => {
    const pin = { x: -80, y: 150 };
    const [connector] = lines(renderPinCallout(makeInput({ ground: pin })));
    expect(connector.points).toHaveLength(3);
    const [start, bend, end] = connector.points;
    expect(Math.hypot(start[0] - pin.x, start[1] - pin.y)).toBeCloseTo(21, 5);
    expect(bend[0]).toBe(pin.x);
    expect(end).toEqual([0, 0]);
    expect(Math.abs(bend[0] - end[0])).toBeCloseTo(Math.abs(bend[1] - end[1]), 5);
  });

  it('starts at the edge of the ring even when the first leg is shorter than the ring', () => {
    // 10px of straight rise: it is swallowed by the ring and the 45° run starts the line.
    const [connector] = lines(renderPinCallout(makeInput()));
    expect(connector.points).toHaveLength(2);
    const [start, end] = connector.points;
    expect(Math.hypot(start[0] - GROUND.x, start[1] - GROUND.y)).toBeGreaterThanOrEqual(15);
    expect(end).toEqual([0, 0]);
  });

  it('draws one straight line when the pin is not far enough below the shelf to bend', () => {
    const [connector] = lines(renderPinCallout(makeInput({ ground: { x: -80, y: -40 } })));
    expect(connector.points).toHaveLength(2);
  });

  it('puts the text on the side away from the pin, or the side chosen', () => {
    const align = (input: Partial<StyleRenderInput<PinCalloutSettings>>) => texts(renderPinCallout(makeInput(input)))[0].align;
    expect(align({})).toBe('left');
    expect(align({ ground: { x: 80, y: 90 } })).toBe('right');
    expect(align({ settings: { ...defaultPinCalloutSettings, side: 'left' } })).toBe('right');
  });

  it('sets the title in capitals and sizes the shelf to the text', () => {
    const shelf = (title: string) => lines(renderPinCallout(makeInput({ content: { title } })))[1].points[1][0];
    expect(texts(renderPinCallout(makeInput({ content: { title: 'cars' } })))[0].text).toBe('CARS');
    expect(shelf('Electronics and more')).toBeGreaterThan(shelf('Oil'));
  });

  it('ripples from the ring only once built, and only while Ripple is on', () => {
    const ripples = (input: StyleRenderInput<PinCalloutSettings>) =>
      circles(renderPinCallout(input)).filter((c) => c.r > 21 && c.strokeWidth === 1.5);
    expect(ripples(makeInput())).toHaveLength(1);
    expect(ripples(makeInput({ itemTime: 3.5 }))[0].r).not.toBe(ripples(makeInput())[0].r);
    expect(ripples(makeInput({ phase: 'enter', phaseProgress: 0.8 }))).toHaveLength(0);
    expect(ripples(makeInput({ settings: { ...defaultPinCalloutSettings, pulse: false } }))).toHaveLength(0);
  });

  it('applies the pin color to the dot, ring and lines, and measures room for the ripple', () => {
    const scene = renderPinCallout(makeInput({ settings: { ...defaultPinCalloutSettings, accentColor: '#ff3d81' } }));
    expect(lines(scene).every((l) => l.stroke === '#ff3d81')).toBe(true);
    expect(circles(scene).every((c) => (c.fill ?? c.stroke) === '#ff3d81')).toBe(true);
    const bounds = measurePinCallout(makeInput());
    expect(bounds.x).toBeLessThanOrEqual(GROUND.x - 38);
    expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(GROUND.x + 38);
  });
});

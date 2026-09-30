import { describe, it, expect } from 'vitest';
import type { CircleNode, GroupNode, SceneNode, StyleRenderInput, TextNode } from '../types';
import {
  defaultWaypointSettings,
  measureWaypoint,
  parseTickNumber,
  renderWaypoint,
  waypointSettingsSchema,
  waypointStyle,
  type WaypointSettings,
} from './waypoint';

function makeInput(overrides: Partial<StyleRenderInput<WaypointSettings>> = {}): StyleRenderInput<WaypointSettings> {
  return {
    content: { title: 'Lisbon', subtitle: 'Day one', badge: '3' },
    settings: { ...defaultWaypointSettings },
    phase: 'visible',
    phaseProgress: 1,
    ground: { x: 0, y: 0 },
    itemTime: 3,
    playheadTime: 3,
    pixelRatio: 1,
    ...overrides,
  };
}

const enter = (progress: number, overrides: Partial<StyleRenderInput<WaypointSettings>> = {}) =>
  renderWaypoint(makeInput({ phase: 'enter', phaseProgress: progress, ...overrides }));

function flatten(node: SceneNode): SceneNode[] {
  return node.type === 'group' ? [node, ...node.children.flatMap(flatten)] : [node];
}
const texts = (s: SceneNode) => flatten(s).filter((n): n is TextNode => n.type === 'text');
const circles = (s: SceneNode) => flatten(s).filter((n): n is CircleNode => n.type === 'circle');
const label = (s: SceneNode, content: string) => texts(s).find((t) => t.text === content);

describe('waypointStyle definition', () => {
  it('is a self-animating, flush marker with no connector', () => {
    expect(waypointStyle).toMatchObject({
      id: 'waypoint',
      category: 'marker',
      icon: 'list-ordered',
      drawsConnector: false,
      supportsAltitude: false,
      defaultOffset: [0, 0],
      defaultTransition: { enter: 'auto', exit: 'auto', enterDuration: 1.1 },
    });
    expect(waypointStyle.contentSlots).toContain('badge');
  });

  it('has a control per setting', () => {
    expect(waypointStyle.controls.map((c) => c.key).sort()).toEqual(Object.keys(defaultWaypointSettings).sort());
    expect(waypointSettingsSchema.parse({})).toEqual(defaultWaypointSettings);
  });
});

describe('waypoint choreography', () => {
  it('draws nothing at progress 0', () => {
    expect(flatten(enter(0)).filter((n) => n.type !== 'group')).toHaveLength(0);
  });

  it('pops the disc and ticks the number before the title shows', () => {
    const scene = enter(0.3);
    expect(circles(scene).length).toBeGreaterThan(0);
    const tick = texts(scene).find((t) => /^\d$/.test(t.text));
    expect(tick).toBeDefined();
    expect(Number(tick!.text)).toBeLessThan(3);
    expect(label(scene, 'LISBON')).toBeUndefined();
  });

  it('slides the title out from behind the disc with the subtitle after it', () => {
    const mid = enter(0.5);
    const title = label(mid, 'LISBON')!;
    const finalX = label(enter(1), 'LISBON')!.x;
    expect(title.x).toBeLessThan(finalX);
    expect(label(mid, 'Day one')).toBeUndefined();
    expect(label(enter(0.7), 'Day one')).toBeDefined();
  });

  it('expands the ring beyond the disc as it settles', () => {
    const rings = (p: number) => circles(enter(p)).filter((c) => c.stroke && !c.fill);
    expect(rings(0.4)[0].r).toBeGreaterThan(18);
  });

  it('plays the exit as the entrance reversed', () => {
    expect(renderWaypoint(makeInput({ phase: 'exit', phaseProgress: 0.5 }))).toEqual(enter(0.5));
  });
});

describe('waypoint layout and settings', () => {
  it('puts the text right of the disc by default and left when asked', () => {
    expect(label(enter(1), 'LISBON')!.align).toBe('left');
    const left = renderWaypoint(makeInput({ settings: { ...defaultWaypointSettings, side: 'left' } }));
    expect(label(left, 'LISBON')!.align).toBe('right');
    expect(label(left, 'LISBON')!.x).toBeLessThan(0);
    expect(measureWaypoint(makeInput({ settings: { ...defaultWaypointSettings, side: 'left' } })).x).toBeLessThan(-50);
  });

  it('falls back to a dot without a badge, and fades non-numeric badges in', () => {
    const noBadge = renderWaypoint(makeInput({ content: { title: 'Stop' } }));
    expect(label(noBadge, '•')).toBeDefined();
    const day = enter(0.3, { content: { title: 'Stop', badge: 'DAY 3' } });
    const badge = label(day, 'DAY 3')!;
    expect(badge.opacity).toBeLessThan(1);
  });

  it('shrinks long badges to fit the disc', () => {
    const short = label(renderWaypoint(makeInput()), '3')!;
    const long = label(renderWaypoint(makeInput({ content: { title: 'Stop', badge: 'DAY 3' } })), 'DAY 3')!;
    expect(long.fontSize).toBeLessThan(short.fontSize);
  });

  it('scales with size and honours the colours', () => {
    const big = renderWaypoint(makeInput({ settings: { ...defaultWaypointSettings, size: 60, accentColor: '#123456' } }));
    const disc = circles(big).find((c) => c.fill === '#123456')!;
    expect(disc.r).toBe(30);
  });

  it('removes the shadows when halo is off', () => {
    const scene = renderWaypoint(makeInput({ settings: { ...defaultWaypointSettings, halo: false } }));
    const shadowed = flatten(scene).filter((n) => 'shadow' in n && n.shadow);
    expect(shadowed).toHaveLength(0);
  });

  it('parses tickable numbers only for short integers', () => {
    expect(parseTickNumber('7')).toBe(7);
    expect(parseTickNumber('12')).toBe(12);
    expect(parseTickNumber('DAY 3')).toBeNull();
    expect(parseTickNumber('123')).toBeNull();
  });

  it('omits the subtitle when absent', () => {
    const scene = renderWaypoint(makeInput({ content: { title: 'Lisbon', badge: '1' } }));
    expect(texts(scene).map((t) => t.text).sort()).toEqual(['1', 'LISBON']);
  });

  it('keeps the title clip on a group so it can slide out', () => {
    const clipped = flatten(enter(0.5)).filter((n): n is GroupNode => n.type === 'group' && !!n.clip);
    expect(clipped).toHaveLength(1);
  });
});

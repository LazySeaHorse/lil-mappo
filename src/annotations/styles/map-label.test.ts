import { describe, it, expect } from 'vitest';
import type { CircleNode, GroupNode, SceneNode, StyleRenderInput, TextNode } from '../types';
import {
  defaultMapLabelSettings,
  mapLabelSettingsSchema,
  mapLabelStyle,
  measureMapLabel,
  renderMapLabel,
  type MapLabelSettings,
} from './map-label';

function makeInput(overrides: Partial<StyleRenderInput<MapLabelSettings>> = {}): StyleRenderInput<MapLabelSettings> {
  return {
    content: { title: 'Sydney', subtitle: 'New South Wales' },
    settings: { ...defaultMapLabelSettings },
    phase: 'visible',
    phaseProgress: 1,
    ground: { x: 0, y: 0 },
    itemTime: 3,
    playheadTime: 3,
    pixelRatio: 1,
    ...overrides,
  };
}

const enter = (progress: number, overrides: Partial<StyleRenderInput<MapLabelSettings>> = {}) =>
  renderMapLabel(makeInput({ phase: 'enter', phaseProgress: progress, ...overrides }));

function flatten(node: SceneNode): SceneNode[] {
  return node.type === 'group' ? [node, ...node.children.flatMap(flatten)] : [node];
}
const texts = (scene: SceneNode) => flatten(scene).filter((n): n is TextNode => n.type === 'text');
const letters = (scene: SceneNode) => texts(scene).filter((t) => t.baseline === 'middle');
const subtitleOf = (scene: SceneNode) => texts(scene).find((t) => t.baseline === 'top');

describe('mapLabelStyle definition', () => {
  it('is a connector-less, altitude-less label centred on the point', () => {
    expect(mapLabelStyle).toMatchObject({
      id: 'map-label',
      category: 'label',
      icon: 'type',
      supportsAltitude: false,
      defaultOffset: [0, 0],
      defaultAnchor: 'center',
      defaultTransition: { enter: 'auto', exit: 'auto', enterDuration: 1.1 },
    });
    expect(mapLabelStyle.drawsConnector).toBeFalsy();
    expect(mapLabelStyle.controls.map((c) => c.key).sort()).toEqual(Object.keys(defaultMapLabelSettings).sort());
  });

  it('fills defaults and rejects unknown variants', () => {
    expect(mapLabelSettingsSchema.parse({})).toEqual(defaultMapLabelSettings);
    expect(mapLabelSettingsSchema.safeParse({ variant: 'sea' }).success).toBe(false);
  });
});

describe('variants', () => {
  it('sets place names in tracked upper-case condensed type', () => {
    const scene = renderMapLabel(makeInput());
    expect(letters(scene).map((t) => t.text).join('')).toBe('SYDNEY');
    expect(letters(scene)[0]).toMatchObject({ fontFamily: 'Barlow Condensed', fontWeight: 600, fill: '#FFFFFF' });
  });

  it('sets water in blue italic serif, keeping the sentence case', () => {
    const scene = renderMapLabel(makeInput({ content: { title: 'Pacific Ocean' }, settings: { ...defaultMapLabelSettings, variant: 'water' } }));
    const first = letters(scene)[0];
    expect(letters(scene).map((t) => t.text).join('')).toBe('PacificOcean');
    expect(first).toMatchObject({ fontFamily: 'Fraunces', fontStyle: 'italic', fill: '#CFE3FF' });
  });

  it('sets regions wider and lighter, and a tint overrides the variant colour', () => {
    const place = measureMapLabel(makeInput({ content: { title: 'Patagonia' } }));
    const region = measureMapLabel(makeInput({ content: { title: 'Patagonia' }, settings: { ...defaultMapLabelSettings, variant: 'region', tint: '#ff0000' } }));
    expect(region.width).toBeGreaterThan(place.width);
    const scene = renderMapLabel(makeInput({ settings: { ...defaultMapLabelSettings, variant: 'region', tint: '#ff0000' } }));
    expect(letters(scene)[0]).toMatchObject({ fontWeight: 500, fill: '#ff0000' });
  });
});

describe('layout', () => {
  it('centres the letters on the point and hangs the subtitle below', () => {
    const scene = renderMapLabel(makeInput());
    const ls = letters(scene);
    const mid = (ls[0].x + ls[ls.length - 1].x) / 2;
    expect(Math.abs(mid)).toBeLessThan(20);
    expect(ls.every((t) => t.y === 0)).toBe(true);
    expect(subtitleOf(scene)!.y).toBeGreaterThan(0);
    expect(subtitleOf(scene)!.align).toBe('center');
  });

  it('omits the subtitle and point marker unless asked for', () => {
    const bare = renderMapLabel(makeInput({ content: { title: 'Solo' } }));
    expect(subtitleOf(bare)).toBeUndefined();
    expect(flatten(bare).some((n) => n.type === 'circle')).toBe(false);
    const dotted = renderMapLabel(makeInput({ settings: { ...defaultMapLabelSettings, showPoint: true } }));
    const dot = flatten(dotted).find((n): n is CircleNode => n.type === 'circle')!;
    expect(dot).toBeDefined();
    expect(flatten(dotted).find((n): n is GroupNode => n.type === 'group' && n.scale !== undefined)!.x).toBeLessThan(-20);
  });

  it('applies the soft shadow unless the halo is off', () => {
    expect(texts(renderMapLabel(makeInput())).every((t) => t.shadow)).toBe(true);
    const flat = renderMapLabel(makeInput({ settings: { ...defaultMapLabelSettings, halo: false } }));
    expect(texts(flat).some((t) => t.shadow)).toBe(false);
  });
});

describe('measure', () => {
  it('is stable across phases and covers the loosest tracking of the entrance', () => {
    const settled = measureMapLabel(makeInput());
    expect(measureMapLabel(makeInput({ phase: 'enter', phaseProgress: 0 }))).toEqual(settled);
    const finishedWidth = letters(renderMapLabel(makeInput())).at(-1)!.x - letters(renderMapLabel(makeInput()))[0].x;
    const early = letters(enter(0.3));
    for (const t of early) {
      expect(t.x).toBeGreaterThanOrEqual(settled.x);
      expect(t.x).toBeLessThanOrEqual(settled.x + settled.width);
    }
    expect(finishedWidth).toBeGreaterThan(0);
  });
});

describe('entrance choreography', () => {
  it('draws nothing at progress 0 and the finished state at 1', () => {
    expect(enter(0)).toEqual({ type: 'group', children: [] });
    expect(enter(1)).toEqual(renderMapLabel(makeInput()));
  });

  it('brings letters in one after another, rising, before the subtitle', () => {
    const mid = enter(0.3);
    const ls = letters(mid);
    expect(ls.length).toBeGreaterThan(0);
    expect(ls.length).toBeLessThan(6);
    expect(ls[0].opacity!).toBeGreaterThan(ls[ls.length - 1].opacity!);
    expect(ls[0].y).toBeGreaterThan(0);
    expect(subtitleOf(mid)).toBeUndefined();
    expect(subtitleOf(enter(0.85))).toBeDefined();
  });

  it('tightens the tracking as it settles', () => {
    const span = (scene: SceneNode) => {
      const ls = letters(scene);
      return ls[ls.length - 1].x - ls[0].x;
    };
    expect(span(enter(0.5))).toBeGreaterThan(span(enter(1)));
  });
});

describe('exit choreography', () => {
  it('plays the entrance in reverse', () => {
    for (const p of [0, 0.3, 0.7, 1]) {
      expect(renderMapLabel(makeInput({ phase: 'exit', phaseProgress: p }))).toEqual(enter(1 - p));
    }
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import '@/annotations/styles';
import {
  collectSceneAssets,
  getFrameBounds,
  loadAnnotationAssets,
  prepareAnnotationFrame,
  MAX_ALTITUDE_PX,
} from './draw';
import { MAP_SCALE_FADE_START, MAP_SCALE_HIDDEN, MAX_MAP_SCALE } from './sizing';
import { getStyle, registerStyle } from './registry';
import { group } from './scene/primitives';
import { registerTestStyles, TEST_CARD_STYLE_ID, TEST_FLAT_STYLE_ID } from './testStyles';
import type { AnnotationStyleDefinition, StyleRenderInput } from './types';
import type { CalloutItem } from '@/store/types';

registerTestStyles();

function makeCallout(overrides: Partial<CalloutItem> = {}): CalloutItem {
  return {
    id: 'c1',
    kind: 'callout',
    styleId: TEST_CARD_STYLE_ID,
    styleVersion: 1,
    content: { title: 'Harbour' },
    binding: { kind: 'geographic', lngLat: [10, 20], altitude: 40 },
    offset: [0, 0],
    anchor: 'bottom',
    startTime: 0,
    endTime: 10,
    transition: { enter: 'fade', exit: 'fade', enterDuration: 1, exitDuration: 1 },
    connector: { visible: true, style: 'solid', color: '#fff', width: 2, endDot: true, endDotRadius: 3 },
    opacity: 1,
    scale: 1,
    sizeMode: 'screen',
    referenceZoom: 12,
    settings: {},
    linkTitleToLocation: false,
    ...overrides,
  };
}

/** A leader-line callout with its own choreography and the default placement. */
function makeLeaderLine(overrides: Partial<CalloutItem> = {}): CalloutItem {
  return makeCallout({
    styleId: 'leader-line',
    content: { title: 'Harbour', subtitle: 'Old town' },
    binding: { kind: 'geographic', lngLat: [10, 20], altitude: 0 },
    offset: [70, -90],
    transition: { enter: 'auto', exit: 'auto', enterDuration: 1.2, exitDuration: 0.5 },
    ...overrides,
  });
}

describe('prepareAnnotationFrame', () => {
  it('returns null outside the time window, for unplaced callouts, and for unknown styles', () => {
    expect(prepareAnnotationFrame(makeCallout(), 11)).toBeNull();
    expect(
      prepareAnnotationFrame(makeCallout({ binding: { kind: 'geographic', lngLat: [0, 0], altitude: 0 } }), 5),
    ).toBeNull();
    expect(prepareAnnotationFrame(makeCallout({ styleId: 'does-not-exist' }), 5)).toBeNull();
  });

  it('keeps a frame at the very start of a fade-in, fully transparent', () => {
    expect(prepareAnnotationFrame(makeCallout(), 0)?.opacity).toBe(0);
  });

  it('lifts the origin by the altitude and adds the offset', () => {
    const frame = prepareAnnotationFrame(makeCallout({ offset: [5, -3] }), 5)!;
    expect(frame.originX).toBe(5);
    expect(frame.originY).toBe(-3 - 40);
    expect(frame.connector).not.toBeNull();
  });

  it('clamps altitude to the screen-space maximum', () => {
    const frame = prepareAnnotationFrame(
      makeCallout({ binding: { kind: 'geographic', lngLat: [10, 20], altitude: 5000 } }),
      5,
    )!;
    expect(frame.originY).toBe(-MAX_ALTITUDE_PX);
  });

  it('ignores altitude and the connector for ground-level styles', () => {
    const frame = prepareAnnotationFrame(makeCallout({ styleId: TEST_FLAT_STYLE_ID }), 5)!;
    expect(frame.originY).toBe(0);
    expect(frame.connector).toBeNull();
  });

  it('applies style defaults for missing or invalid settings', () => {
    const frame = prepareAnnotationFrame(makeCallout({ settings: { color: 42 } }), 5)!;
    const scene = frame.scene;
    expect(scene.type).toBe('group');
    if (scene.type !== 'group') return;
    const rect = scene.children.find((n) => n.type === 'rect');
    expect(rect && rect.type === 'rect' && rect.fill).toBe('#0f172a');
  });
});

describe('settled frames', () => {
  // A 2 s clip with a 1 s entrance and a 1 s exit has no room for a visible phase.
  const short = { startTime: 4, endTime: 6 };

  it('draws a callout fully entered, however the clip is timed', () => {
    for (const time of [0, 4, 5, 6, 30]) {
      const frame = prepareAnnotationFrame(makeCallout(short), time, { settled: true })!;
      expect(frame.opacity).toBe(1);
      expect(frame.scale).toBe(1);
    }
  });

  it('is what a real frame lacks at the end of the clip', () => {
    expect(prepareAnnotationFrame(makeCallout(short), 6)!.opacity).toBe(0);
    expect(prepareAnnotationFrame(makeCallout(short), 4)!.opacity).toBe(0);
  });

  it('settles block transitions, and style animations in their visible phase', () => {
    const scaleUp = makeCallout({ transition: { enter: 'scale-up', exit: 'scale-down', enterDuration: 1, exitDuration: 1 } });
    const frame = prepareAnnotationFrame(scaleUp, 0, { settled: true })!;
    expect(frame.opacity).toBe(1);
    expect(frame.scale).toBe(1);
    expect(frame.translateY).toBe(0);

    const leader = makeLeaderLine();
    const fromStart = JSON.stringify(prepareAnnotationFrame(leader, 0, { settled: true })!.scene);
    const fromEnd = JSON.stringify(prepareAnnotationFrame(leader, leader.startTime + leader.transition.enterDuration, { settled: true })!.scene);
    expect(fromStart).toBe(fromEnd);
    expect(fromStart).not.toBe(JSON.stringify(prepareAnnotationFrame(leader, 0.1)!.scene));
  });

  it('still hides unplaced callouts', () => {
    const unplaced = makeCallout({ binding: { kind: 'geographic', lngLat: [0, 0], altitude: 0 } });
    expect(prepareAnnotationFrame(unplaced, 0, { settled: true })).toBeNull();
  });
});

describe('pixel scale', () => {
  const callout = makeCallout({
    offset: [12, -6],
    scale: 1.5,
    transition: { enter: 'slide-up', exit: 'slide-down', enterDuration: 1, exitDuration: 1 },
  });

  it('scales the origin, artwork and slide of a frame', () => {
    const editor = prepareAnnotationFrame(callout, 0.5)!;
    const doubled = prepareAnnotationFrame(callout, 0.5, { pixelScale: 2 })!;
    expect(doubled.originX).toBe(editor.originX * 2);
    expect(doubled.originY).toBe(editor.originY * 2);
    expect(doubled.scale).toBe(editor.scale * 2);
    expect(doubled.translateY).toBe(editor.translateY * 2);
    expect(doubled.opacity).toBe(editor.opacity);
    expect(doubled.pixelScale).toBe(2);
  });

  it('has bounds at exactly twice the editor bounds', () => {
    for (const time of [0.5, 5]) {
      const editor = prepareAnnotationFrame(callout, time)!;
      const doubled = prepareAnnotationFrame(callout, time, { pixelScale: 2 })!;
      expect(doubled.bounds.minX).toBeCloseTo(editor.bounds.minX * 2);
      expect(doubled.bounds.minY).toBeCloseTo(editor.bounds.minY * 2);
      expect(doubled.bounds.maxX).toBeCloseTo(editor.bounds.maxX * 2);
      expect(doubled.bounds.maxY).toBeCloseTo(editor.bounds.maxY * 2);
    }
  });

  it('keeps the padding at least as large in output pixels for small callouts', () => {
    const small = makeCallout({ scale: 0.5 });
    const editor = prepareAnnotationFrame(small, 5)!;
    const doubled = prepareAnnotationFrame(small, 5, { pixelScale: 2 })!;
    expect(doubled.bounds.maxX - doubled.bounds.minX).toBeCloseTo((editor.bounds.maxX - editor.bounds.minX) * 2);
  });

  it('contains the connector end dot scaled with the frame', () => {
    const editor = getFrameBounds(prepareAnnotationFrame(makeCallout({ offset: [0, 200] }), 5)!);
    const doubled = getFrameBounds(prepareAnnotationFrame(makeCallout({ offset: [0, 200] }), 5, { pixelScale: 2 })!);
    expect(doubled.maxY).toBeGreaterThanOrEqual(editor.maxY);
    expect(doubled.minX).toBeLessThanOrEqual(-3 * 2);
  });
});

describe('map size mode', () => {
  const mapSized = (overrides: Partial<CalloutItem> = {}) => makeCallout({
    sizeMode: 'map',
    referenceZoom: 12,
    offset: [10, -4],
    transition: { enter: 'fade', exit: 'fade', enterDuration: 0, exitDuration: 0 },
    ...overrides,
  });

  it('draws as a screen callout at the reference zoom', () => {
    const at = prepareAnnotationFrame(mapSized(), 5, { viewZoom: 12 })!;
    const screen = prepareAnnotationFrame(makeCallout({ offset: [10, -4] }), 5)!;
    expect(at.scale).toBe(screen.scale);
    expect(at.originX).toBe(screen.originX);
    expect(at.originY).toBe(screen.originY);
    expect(at.bounds).toEqual(screen.bounds);
  });

  it('scales the artwork, offset and altitude by the zoom factor', () => {
    const frame = prepareAnnotationFrame(mapSized(), 5, { viewZoom: 13 })!;
    expect(frame.scale).toBe(2);
    expect(frame.originX).toBe(10 * 2);
    // Offset -4 lifted by the 40px altitude, both doubled.
    expect(frame.originY).toBe((-4 - 40) * 2);
  });

  it('scales the altitude cap along with the zoom', () => {
    const high = mapSized({ binding: { kind: 'geographic', lngLat: [10, 20], altitude: 5000 }, offset: [0, 0] });
    expect(prepareAnnotationFrame(high, 5, { viewZoom: 11 })!.originY).toBe(-MAX_ALTITUDE_PX / 2);
  });

  it('composes with the pixel scale of an export', () => {
    // An export at twice the editor width sits one zoom level in; the editor viewZoom is unchanged.
    const editor = prepareAnnotationFrame(mapSized(), 5, { viewZoom: 13 })!;
    const exported = prepareAnnotationFrame(mapSized(), 5, { viewZoom: 13, pixelScale: 2 })!;
    expect(exported.scale).toBe(editor.scale * 2);
    expect(exported.originX).toBe(editor.originX * 2);
    expect(exported.originY).toBe(editor.originY * 2);
    expect(exported.bounds.maxX).toBeCloseTo(editor.bounds.maxX * 2);
  });

  it('caps the scale so canvases stay bounded, and moves the placement with it', () => {
    const frame = prepareAnnotationFrame(mapSized(), 5, { viewZoom: 30 })!;
    expect(frame.scale).toBe(MAX_MAP_SCALE);
    expect(frame.originX).toBe(10 * MAX_MAP_SCALE);
  });

  it('fades out, then stops drawing, when zoomed far out', () => {
    const halfway = prepareAnnotationFrame(mapSized(), 5, { viewZoom: 12 + Math.log2((MAP_SCALE_FADE_START + MAP_SCALE_HIDDEN) / 2) })!;
    expect(halfway.opacity).toBeCloseTo(0.5);
    expect(prepareAnnotationFrame(mapSized(), 5, { viewZoom: 12 + Math.log2(MAP_SCALE_HIDDEN * 0.99) })).toBeNull();
  });

  it('ignores the view zoom in screen mode', () => {
    const near = prepareAnnotationFrame(makeCallout(), 5, { viewZoom: 20 })!;
    const far = prepareAnnotationFrame(makeCallout(), 5, { viewZoom: 2 })!;
    expect(near.scale).toBe(far.scale);
    expect(near.opacity).toBe(far.opacity);
  });
});

describe('eyebrow fallback', () => {
  const COORDINATES = '20.0000° N, 10.0000° E';
  const sceneText = (styleId: string, content: CalloutItem['content']) => {
    const callout = makeCallout({
      styleId,
      content,
      binding: { kind: 'geographic', lngLat: [10, 20], altitude: 0 },
      transition: { enter: 'fade', exit: 'fade', enterDuration: 1, exitDuration: 1 },
    });
    return JSON.stringify(prepareAnnotationFrame(callout, 5)!.scene);
  };

  it('fills an empty eyebrow with the coordinates only for styles that opt in', () => {
    expect(getStyle('target-lock')!.eyebrowFallback).toBe('coordinates');
    expect(sceneText('target-lock', { title: 'Harbour' })).toContain(COORDINATES);
    expect(getStyle('editorial')!.eyebrowFallback).toBeUndefined();
    expect(sceneText('editorial', { title: 'Harbour' })).not.toContain('°');
  });

  it('keeps an eyebrow the user wrote', () => {
    expect(sceneText('target-lock', { title: 'Harbour', eyebrow: 'SITE 4' })).not.toContain(COORDINATES);
    expect(sceneText('editorial', { title: 'Harbour', eyebrow: '1943' })).toContain('1943');
  });
});

describe('getFrameBounds', () => {
  it('contains the style box around the origin and the ground point', () => {
    const frame = prepareAnnotationFrame(makeCallout({ offset: [30, 0] }), 5)!;
    const bounds = getFrameBounds(frame);
    // The card measures x -40..40, y -24..0 around the origin (30, -40).
    expect(bounds.minX).toBeLessThanOrEqual(30 - 40);
    expect(bounds.maxX).toBeGreaterThanOrEqual(30 + 40);
    expect(bounds.minY).toBeLessThanOrEqual(-40 - 24);
    // Ground point (0, 0) and the connector end dot fit inside.
    expect(bounds.maxY).toBeGreaterThanOrEqual(3);
    expect(bounds.minX).toBeLessThanOrEqual(-3);
  });

  it('does not reserve room on the side a style never draws to', () => {
    const bounds = getFrameBounds(prepareAnnotationFrame(makeCallout({ offset: [0, 0] }), 5)!);
    // Cards sit above their origin: nothing but padding below the ground.
    expect(bounds.maxY).toBeLessThan(40);
  });

  it('scales the style box with the callout scale', () => {
    const one = getFrameBounds(prepareAnnotationFrame(makeCallout({ styleId: TEST_FLAT_STYLE_ID }), 5)!);
    const two = getFrameBounds(prepareAnnotationFrame(makeCallout({ styleId: TEST_FLAT_STYLE_ID, scale: 2 }), 5)!);
    expect(two.maxX - two.minX).toBeGreaterThan(one.maxX - one.minX);
  });

  it('covers the ground point and the whole finished leader line and text', () => {
    const callout = makeLeaderLine();
    const bounds = getFrameBounds(prepareAnnotationFrame(callout, 5)!);
    // Ground (0, 0), elbow (70, -90), shelf running right and the text above it.
    expect(bounds.minX).toBeLessThanOrEqual(-8);
    expect(bounds.maxX).toBeGreaterThan(70 + 48);
    expect(bounds.minY).toBeLessThan(-90 - 22);
    expect(bounds.maxY).toBeGreaterThanOrEqual(8);
  });

  it('is identical in every phase, so the canvas never resizes while animating', () => {
    const callout = makeLeaderLine();
    const at = (t: number) => getFrameBounds(prepareAnnotationFrame(callout, t)!);
    const settled = at(5);
    for (const t of [0, 0.3, 0.9, 9.6, 10]) expect(at(t)).toEqual(settled);
  });

  it('leaves room for a block slide transition', () => {
    const auto = getFrameBounds(prepareAnnotationFrame(
      makeCallout({ styleId: TEST_FLAT_STYLE_ID, transition: { enter: 'auto', exit: 'auto', enterDuration: 1, exitDuration: 1 } }),
      5,
    )!);
    const slide = getFrameBounds(prepareAnnotationFrame(
      makeCallout({ styleId: TEST_FLAT_STYLE_ID, transition: { enter: 'slide-up', exit: 'slide-down', enterDuration: 1, exitDuration: 1 } }),
      5,
    )!);
    expect(slide.minY).toBeLessThan(auto.minY);
    expect(slide.maxY).toBeGreaterThan(auto.maxY);
  });
});

describe('annotation assets', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('collects the exact fonts and images a scene draws', () => {
    const frame = prepareAnnotationFrame(makeLeaderLine(), 5)!;
    const assets = collectSceneAssets(frame.scene);
    expect(assets.images).toEqual([]);
    expect(assets.fonts.sort()).toEqual([
      "500 14px 'Barlow Condensed', sans-serif",
      "600 22px 'Barlow Condensed', sans-serif",
    ]);
  });

  it('loads fonts for every callout before export, including ones not yet on screen', async () => {
    const load = vi.fn((_font: string) => Promise.resolve([]));
    vi.stubGlobal('document', Object.assign(Object.create(document), { fonts: { load } }));

    const later = makeCallout({ id: 'c2', startTime: 20, endTime: 30 });
    await loadAnnotationAssets({ c1: makeLeaderLine(), c2: later }, ['c1', 'c2']);

    const loaded = load.mock.calls.map(([font]) => font);
    expect(loaded.some((f) => f.includes("'Barlow Condensed'"))).toBe(true);
    expect(loaded.some((f) => f.includes("'Outfit'"))).toBe(true);
  });

  it('loads the finished scene fonts even when the mid-point falls inside an entrance', async () => {
    const load = vi.fn((_font: string) => Promise.resolve([]));
    vi.stubGlobal('document', Object.assign(Object.create(document), { fonts: { load } }));

    // 1s long: its mid-point is half way through a 1.2s entrance, before the text is drawn.
    const brief = makeLeaderLine({ startTime: 0, endTime: 1 });
    expect(collectSceneAssets(prepareAnnotationFrame(brief, 0.5)!.scene).fonts).toEqual([]);

    await loadAnnotationAssets({ c1: brief }, ['c1']);
    expect(load.mock.calls.map(([font]) => font)).toContain("600 22px 'Barlow Condensed', sans-serif");
  });
});

describe('style-owned choreography', () => {
  const seen: Array<StyleRenderInput<Record<string, never>>> = [];
  const probe: AnnotationStyleDefinition<Record<string, never>> = {
    id: 'probe',
    version: 1,
    name: 'Probe',
    description: 'Records the input it is rendered with',
    category: 'label',
    icon: 'type',
    contentSlots: ['title'],
    settingsSchema: z.object({}) as never,
    defaultSettings: {},
    drawsConnector: true,
    controls: [],
    render(input) {
      seen.push(input);
      return group({});
    },
    measure: () => ({ x: -5, y: -10, width: 10, height: 10 }),
  };
  registerStyle(probe);

  const transition = (enter: string, exit = enter) => ({ enter, exit, enterDuration: 2, exitDuration: 2 });
  const last = () => seen[seen.length - 1];

  it('gives the style the real phase and progress under the style animation, with no block effect', () => {
    const frame = prepareAnnotationFrame(makeCallout({ styleId: 'probe', transition: transition('auto') }), 1)!;
    expect(last().phase).toBe('enter');
    expect(last().phaseProgress).toBeCloseTo(0.5);
    expect(frame.opacity).toBe(1);
    expect(frame.scale).toBe(1);
    expect(frame.translateY).toBe(0);

    prepareAnnotationFrame(makeCallout({ styleId: 'probe', transition: transition('auto') }), 9)!;
    expect(last().phase).toBe('exit');
    expect(last().phaseProgress).toBeCloseTo(0.5);
  });

  it('still applies the callout opacity and scale under the style animation', () => {
    const frame = prepareAnnotationFrame(
      makeCallout({ styleId: 'probe', transition: transition('auto'), opacity: 0.5, scale: 2 }),
      1,
    )!;
    expect(frame.opacity).toBe(0.5);
    expect(frame.scale).toBe(2);
  });

  it('renders the finished state under a block transition while the block animates', () => {
    const frame = prepareAnnotationFrame(makeCallout({ styleId: 'probe', transition: transition('fade') }), 1)!;
    expect(last().phase).toBe('visible');
    expect(last().phaseProgress).toBe(1);
    expect(frame.opacity).toBeCloseTo(0.5);

    prepareAnnotationFrame(makeCallout({ styleId: 'probe', transition: transition('slide-up', 'scale-down') }), 9)!;
    expect(last().phase).toBe('visible');
  });

  it('decides per phase, so enter can be style-owned while exit is a fade', () => {
    prepareAnnotationFrame(makeCallout({ styleId: 'probe', transition: transition('auto', 'fade') }), 1);
    expect(last().phase).toBe('enter');
    prepareAnnotationFrame(makeCallout({ styleId: 'probe', transition: transition('auto', 'fade') }), 9);
    expect(last().phase).toBe('visible');
  });

  it('gives the style the ground point relative to its origin', () => {
    prepareAnnotationFrame(
      makeCallout({ styleId: 'probe', offset: [70, -90], binding: { kind: 'geographic', lngLat: [10, 20], altitude: 10 } }),
      5,
    );
    // Origin = ground + offset - altitude = (70, -100); the ground is the opposite way.
    expect(last().ground).toEqual({ x: -70, y: 100 });
  });

  it('keeps the drawn ground point on the map when the callout is scaled', () => {
    const frame = prepareAnnotationFrame(makeCallout({ styleId: 'probe', offset: [60, -80], scale: 2 }), 5)!;
    expect(last().ground).toEqual({ x: -30, y: 60 }); // origin (60, -80 - 40 altitude), halved by the scale
    // Drawn at scale 2 about the origin, the ground lands back on (0, 0).
    expect(frame.originX + last().ground.x * frame.scale).toBe(0);
    expect(frame.originY + last().ground.y * frame.scale).toBe(0);
  });

  it('skips the generic connector for styles that draw their own', () => {
    expect(prepareAnnotationFrame(makeCallout({ styleId: 'probe' }), 5)!.connector).toBeNull();
  });
});

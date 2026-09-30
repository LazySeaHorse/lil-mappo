import { describe, it, expect, vi, afterEach } from 'vitest';
import '@/annotations/styles';
import {
  collectSceneAssets,
  getFrameBounds,
  loadAnnotationAssets,
  prepareAnnotationFrame,
  MAX_ALTITUDE_PX,
} from './draw';
import { getStyle, registerStyle } from './registry';
import { z } from 'zod';
import { group } from './scene/primitives';
import type { AnnotationStyleDefinition, StyleRenderInput } from './types';
import type { CalloutItem } from '@/store/types';

function makeCallout(overrides: Partial<CalloutItem> = {}): CalloutItem {
  return {
    id: 'c1',
    kind: 'callout',
    styleId: 'standard-card',
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
    settings: {},
    linkTitleToLocation: false,
    ...overrides,
  };
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
    const frame = prepareAnnotationFrame(makeCallout({ styleId: 'ripple-marker' }), 5)!;
    expect(frame.originY).toBe(0);
    expect(frame.connector).toBeNull();
  });

  it('applies style defaults for missing or invalid settings', () => {
    const frame = prepareAnnotationFrame(makeCallout({ settings: { bgColor: 42 } }), 5)!;
    const scene = frame.scene;
    expect(scene.type).toBe('group');
    if (scene.type !== 'group') return;
    const rect = scene.children.find((n) => n.type === 'rect');
    expect(rect && rect.type === 'rect' && rect.fill).toBe('#0f172a');
  });
});

describe('getFrameBounds', () => {
  it('contains the ground point and the whole area around the origin', () => {
    const frame = prepareAnnotationFrame(makeCallout(), 5)!;
    const bounds = getFrameBounds(frame);
    expect(bounds.minX).toBeLessThanOrEqual(-frame.extent);
    expect(bounds.maxX).toBeGreaterThanOrEqual(frame.extent);
    expect(bounds.minY).toBeLessThanOrEqual(frame.originY - frame.extent);
    // Ground point (0, 0) and the connector end dot fit inside.
    expect(bounds.maxY).toBeGreaterThanOrEqual(3);
  });

  it('leaves room above tall cards so their tops are not clipped', () => {
    const content = { title: 'Summit', body: '4,392 m', eyebrow: '46.85° N, 121.76° W' };
    const frame = prepareAnnotationFrame(
      makeCallout({ styleId: 'topo-label', settings: { showMetadata: true }, content }),
      5,
    )!;
    const { height } = getStyle('topo-label')!.measure({
      content,
      settings: { showMetadata: true, fontFamily: 'Outfit' },
      phase: 'visible',
      phaseProgress: 1,
      itemTime: 5,
      playheadTime: 5,
      pixelRatio: 1,
    });
    expect(height).toBeGreaterThan(48);
    // Topo cards sit with their bottom edge on the origin.
    expect(getFrameBounds(frame).minY).toBeLessThanOrEqual(frame.originY - height);
  });
});

describe('annotation assets', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('collects the exact fonts and images a scene draws', () => {
    const frame = prepareAnnotationFrame(
      makeCallout({ styleId: 'image-circle', content: { title: 'Ana', image: 'https://example.com/a.png' } }),
      5,
    )!;
    const assets = collectSceneAssets(frame.scene);
    expect(assets.images).toEqual(['https://example.com/a.png']);
    expect(assets.fonts.length).toBeGreaterThan(0);
    expect(assets.fonts.every((f) => f.includes("'Outfit'"))).toBe(true);
  });

  it('loads fonts for every callout before export, including ones not yet on screen', async () => {
    const load = vi.fn((_font: string) => Promise.resolve([]));
    vi.stubGlobal('document', Object.assign(Object.create(document), { fonts: { load } }));

    const later = makeCallout({ id: 'c2', startTime: 20, endTime: 30, settings: { fontFamily: 'Lexend' } });
    await loadAnnotationAssets({ c1: makeCallout(), c2: later }, ['c1', 'c2']);

    const loaded = load.mock.calls.map(([font]) => font);
    expect(loaded.some((f) => f.includes("'Outfit'"))).toBe(true);
    expect(loaded.some((f) => f.includes("'Lexend'"))).toBe(true);
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
    measure: () => ({ width: 10, height: 10 }),
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

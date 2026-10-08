import type { Map as MapboxMap } from 'mapbox-gl';
import { describe, expect, it, vi } from 'vitest';
import type { BoundaryItem } from '@/store/types';
import { DEFAULT_BOUNDARY_STYLE } from '@/store/itemFactories';
import { BoundaryMaskRenderer } from './BoundaryMaskRenderer';

const LAYER = 'boundary-mask-layer';
const CLIP = 'boundary-mask-clip';
const SOURCE = 'boundary-mask';

interface LayerDouble {
  id: string;
  type?: string;
  source?: string;
  slot?: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
}

function createMapDouble() {
  const layers = new Map<string, LayerDouble>();
  const order: string[] = [];
  const sources = new Map<string, { type: 'geojson'; data?: unknown; setData: ReturnType<typeof vi.fn> }>();
  const states = new Map<number, Record<string, unknown>>();
  const map = {
    layers,
    order,
    sources,
    states,
    isStyleLoaded: vi.fn(() => true),
    getLayer: vi.fn((id: string) => layers.get(id)),
    addLayer: vi.fn((layer: LayerDouble, beforeId?: string) => {
      layers.set(layer.id, layer);
      const index = beforeId ? order.indexOf(beforeId) : -1;
      order.splice(index >= 0 ? index : order.length, 0, layer.id);
    }),
    removeLayer: vi.fn((id: string) => {
      layers.delete(id);
      order.splice(order.indexOf(id), 1);
    }),
    setLayoutProperty: vi.fn((id: string, prop: string, val: unknown) => {
      const l = layers.get(id);
      if (l) l.layout = { ...(l.layout || {}), [prop]: val };
    }),
    setFeatureState: vi.fn(({ id }: { id: number }, state: Record<string, unknown>) => {
      states.set(id, { ...states.get(id), ...state });
    }),
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string, spec: { data?: unknown }) => sources.set(id, { type: 'geojson', data: spec.data, setData: vi.fn() })),
    removeSource: vi.fn((id: string) => sources.delete(id)),
  };
  return { map: map as unknown as MapboxMap, ...map };
}

const square = (x: number, size: number): GeoJSON.Polygon => ({
  type: 'Polygon',
  coordinates: [[[x, 0], [x + size, 0], [x + size, size], [x, size], [x, 0]]],
});

function boundary(id: string, overrides: Partial<BoundaryItem['style']> = {}, extra: Partial<BoundaryItem> = {}): BoundaryItem {
  return {
    kind: 'boundary',
    id,
    placeName: id,
    geojson: square(0, 10),
    resolveStatus: 'resolved',
    startTime: 0,
    endTime: 10,
    easing: 'linear',
    exitAnimation: 'none',
    style: { ...DEFAULT_BOUNDARY_STYLE, animateStroke: false, maskOutside: true, maskColor: '#112233', maskOpacity: 0.8, ...overrides },
    ...extra,
  };
}

function setup() {
  const double = createMapDouble();
  const renderer = new BoundaryMaskRenderer(double.map);
  renderer.mount();
  return { ...double, renderer, setData: double.sources.get(SOURCE)!.setData };
}

describe('BoundaryMaskRenderer', () => {
  it('adds a transition-free fill on top of the basemap (no slot, no beforeId), painted from feature state', () => {
    const { layers, addLayer } = setup();
    const layer = layers.get(LAYER)!;
    expect(layer.type).toBe('fill');
    expect(layer).not.toHaveProperty('slot');
    expect(layer.paint?.['fill-opacity']).toEqual(['coalesce', ['feature-state', 'opacity'], 0]);
    expect(layer.paint?.['fill-opacity-transition']).toEqual({ duration: 0, delay: 0 });
    expect(layer.paint?.['fill-color-transition']).toEqual({ duration: 0, delay: 0 });
    expect(addLayer.mock.calls[0][1]).toBeUndefined();
  });

  it('uploads only when the active set changes', () => {
    const { renderer, setData } = setup();
    const a = boundary('a');
    const b = boundary('b', {}, { startTime: 5, endTime: 8, geojson: square(20, 10) });
    const items = [a, b];
    renderer.render(items, () => 1);
    renderer.render(items, () => 2);
    renderer.render(items, () => 3);
    expect(setData).toHaveBeenCalledTimes(1);
    renderer.render(items, () => 6); // b joins
    renderer.render(items, () => 7);
    expect(setData).toHaveBeenCalledTimes(2);
  });

  it('does not upload while nothing is masked, and clears when the last mask ends', () => {
    const { renderer, setData } = setup();
    const a = { ...boundary('a'), exitAnimation: 'fade' as const };
    renderer.render([a], () => -1);
    expect(setData).not.toHaveBeenCalled();
    renderer.render([a], () => 5);
    renderer.render([a], () => 12);
    expect(setData).toHaveBeenCalledTimes(2);
    expect(setData.mock.calls[1][0].features).toEqual([]);
  });

  it('re-uploads when the geometry reference changes', () => {
    const { renderer, setData } = setup();
    const a = boundary('a');
    renderer.render([a], () => 1);
    renderer.render([{ ...a, geojson: { ...(a.geojson as GeoJSON.Polygon) } }], () => 1);
    expect(setData).toHaveBeenCalledTimes(2);
  });

  it('writes each region\'s opacity and color as feature state, only when it changes', () => {
    const { renderer, states, setData, setFeatureState } = setup();
    const a = boundary('a');
    renderer.render([a], () => 1);
    expect(states.get(0)).toEqual({ opacity: 0.8, color: '#112233' });
    expect(states.get(1)).toMatchObject({ opacity: 0 });
    renderer.render([{ ...a, exitAnimation: 'fade' }], () => 10.25);
    expect(states.get(0)?.opacity).toBeCloseTo(0.4);
    expect(setData).toHaveBeenCalledTimes(1);
    const calls = setFeatureState.mock.calls.length;
    renderer.render([{ ...a, exitAnimation: 'fade' }], () => 10.25);
    expect(setFeatureState.mock.calls.length).toBe(calls);
  });

  it('fades a second boundary\'s area open instead of cutting it at once', () => {
    const { renderer, states } = setup();
    const a = boundary('a');
    const b = boundary('b', { animateStroke: true, animationStyle: 'fade' }, { startTime: 10, endTime: 20, geojson: square(20, 10) });
    renderer.render([a, b], () => 12);
    // b is 20% in: its area is still 80% as dark as the outside
    expect(states.get(2)?.opacity).toBeCloseTo(0.8 * 0.8);
    renderer.render([a, b], () => 20);
    expect(states.get(2)?.opacity).toBe(0);
    expect(states.get(0)?.opacity).toBeCloseTo(0.8);
  });

  it('removes labels under dark regions with a clip layer below the mask fill, only while needed', () => {
    const { renderer, layers, order, sources } = setup();
    expect(layers.has(CLIP)).toBe(false);
    renderer.render([boundary('a', { maskOpacity: 0.3 })], () => 1);
    expect(layers.has(CLIP)).toBe(false);
    renderer.render([boundary('a')], () => 1);
    const clip = layers.get(CLIP)!;
    expect(clip.type).toBe('clip');
    expect(clip.layout).toEqual({ 'clip-layer-types': ['symbol', 'model'] });
    expect(order.indexOf(CLIP)).toBeLessThan(order.indexOf(LAYER));
    // only the outside (region 0) is dark; the boundary's own area keeps its labels
    const data = sources.get(clip.source!)?.data as GeoJSON.FeatureCollection;
    expect(data.features.map((f) => f.id)).toEqual([0]);
  });

  it('gives every new clip shape a fresh source, and drops the clip when nothing is dark', () => {
    const { renderer, layers, sources } = setup();
    const a = { ...boundary('a'), exitAnimation: 'fade' as const };
    const b = boundary('b', {}, { startTime: 5, endTime: 6, geojson: square(20, 10) });
    renderer.render([a, b], () => 1);
    const first = layers.get(CLIP)?.source;
    renderer.render([a, b], () => 2);
    expect(layers.get(CLIP)?.source).toBe(first);
    renderer.render([a, b], () => 5.5); // b joins: same ids, new shape
    const second = layers.get(CLIP)?.source;
    expect(second).not.toBe(first);
    expect(sources.has(first!)).toBe(false);
    renderer.render([{ ...a, exitAnimation: 'none' }, { ...b, exitAnimation: 'fade', endTime: 6 }], () => 6.45);
    expect(layers.has(CLIP)).toBe(true);
    renderer.render([a], () => 10.45); // 0.08 left
    expect(layers.has(CLIP)).toBe(false);
    expect([...sources.keys()]).toEqual([SOURCE]);
  });

  it('ignores unresolved boundaries', () => {
    const { renderer, setData } = setup();
    renderer.render([boundary('a', {}, { resolveStatus: 'loading' })], () => 1);
    expect(setData).not.toHaveBeenCalled();
  });

  it('removes its layers and source on dispose and stops rendering', () => {
    const { renderer, layers, sources, setData } = setup();
    renderer.render([boundary('a')], () => 1);
    renderer.dispose();
    expect(layers.has(LAYER)).toBe(false);
    expect(layers.has(CLIP)).toBe(false);
    expect(sources.has(SOURCE)).toBe(false);
    renderer.render([boundary('a')], () => 1);
    expect(setData).toHaveBeenCalledTimes(1);
  });

  it('can be mounted again after a style switch', () => {
    const { renderer, layers } = setup();
    renderer.dispose();
    renderer.mount();
    expect(layers.has(LAYER)).toBe(true);
  });
});

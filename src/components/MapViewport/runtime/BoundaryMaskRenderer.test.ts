import type { Map as MapboxMap } from 'mapbox-gl';
import { describe, expect, it, vi } from 'vitest';
import type { BoundaryItem } from '@/store/types';
import { DEFAULT_BOUNDARY_STYLE } from '@/store/itemFactories';
import { BoundaryMaskRenderer } from './BoundaryMaskRenderer';

const LAYER = 'boundary-mask-layer';
const SOURCE = 'boundary-mask';

function createMapDouble() {
  const layers = new Map<string, { id: string; paint?: Record<string, unknown>; slot?: string }>();
  const sources = new Map<string, { type: 'geojson'; setData: ReturnType<typeof vi.fn> }>();
  const map = {
    layers,
    sources,
    isStyleLoaded: vi.fn(() => true),
    getLayer: vi.fn((id: string) => layers.get(id)),
    addLayer: vi.fn((layer: { id: string }, _beforeId?: string) => { layers.set(layer.id, layer); }),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    setPaintProperty: vi.fn((id: string, prop: string, val: unknown) => {
      const l = layers.get(id);
      if (l) l.paint = { ...(l.paint || {}), [prop]: val };
    }),
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string) => sources.set(id, { type: 'geojson', setData: vi.fn() })),
    removeSource: vi.fn((id: string) => sources.delete(id)),
  };
  return { map: map as unknown as MapboxMap, ...map };
}

function boundary(id: string, overrides: Partial<BoundaryItem['style']> = {}, extra: Partial<BoundaryItem> = {}): BoundaryItem {
  return {
    kind: 'boundary',
    id,
    placeName: id,
    geojson: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
    resolveStatus: 'resolved',
    startTime: 0,
    endTime: 10,
    easing: 'linear',
    exitAnimation: 'none',
    style: { ...DEFAULT_BOUNDARY_STYLE, animateStroke: false, maskOutside: true, maskColor: '#112233', maskOpacity: 0.8, ...overrides },
    ...extra,
  };
}

function setup(placement: { slot?: 'middle'; beforeId?: string } = { slot: 'middle' }) {
  const double = createMapDouble();
  const renderer = new BoundaryMaskRenderer(double.map, () => placement);
  renderer.mount();
  return { ...double, renderer, setData: double.sources.get(SOURCE)!.setData };
}

describe('BoundaryMaskRenderer', () => {
  it('adds a transition-free fill layer in the requested slot', () => {
    const { layers, addLayer } = setup({ slot: 'middle' });
    const layer = layers.get(LAYER) as { type?: string; slot?: string; paint?: Record<string, unknown> };
    expect(layer.type).toBe('fill');
    expect(layer.slot).toBe('middle');
    expect(layer.paint?.['fill-opacity-transition']).toEqual({ duration: 0, delay: 0 });
    expect(layer.paint?.['fill-color-transition']).toEqual({ duration: 0, delay: 0 });
    expect(addLayer.mock.calls[0][1]).toBeUndefined();
  });

  it('passes beforeId for classic styles and no slot', () => {
    const { layers, addLayer } = setup({ beforeId: 'road-label' });
    expect(addLayer.mock.calls[0][1]).toBe('road-label');
    expect((layers.get(LAYER) as { slot?: string }).slot).toBeUndefined();
  });

  it('uploads only when the active set changes', () => {
    const { renderer, setData } = setup();
    const a = boundary('a');
    const b = boundary('b', {}, { startTime: 5, endTime: 8 });
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

  it('updates opacity and color per frame without re-uploading', () => {
    const { renderer, layers, setData, setPaintProperty } = setup();
    const a = boundary('a', { maskOpacity: 0.8 });
    renderer.render([a], () => 1);
    expect(layers.get(LAYER)?.paint?.['fill-opacity']).toBeCloseTo(0.8);
    expect(layers.get(LAYER)?.paint?.['fill-color']).toBe('#112233');
    renderer.render([{ ...a, exitAnimation: 'fade' }], () => 10.25);
    expect(layers.get(LAYER)?.paint?.['fill-opacity']).toBeCloseTo(0.4);
    expect(setData).toHaveBeenCalledTimes(1);
    const calls = setPaintProperty.mock.calls.length;
    renderer.render([{ ...a, exitAnimation: 'fade' }], () => 10.25);
    expect(setPaintProperty.mock.calls.length).toBe(calls);
  });

  it('ignores unresolved boundaries', () => {
    const { renderer, setData } = setup();
    renderer.render([boundary('a', {}, { resolveStatus: 'loading' })], () => 1);
    expect(setData).not.toHaveBeenCalled();
  });

  it('removes its layer and source on dispose and stops rendering', () => {
    const { renderer, layers, sources, setData } = setup();
    renderer.dispose();
    expect(layers.has(LAYER)).toBe(false);
    expect(sources.has(SOURCE)).toBe(false);
    renderer.render([boundary('a')], () => 1);
    expect(setData).not.toHaveBeenCalled();
  });

  it('can be mounted again after a style switch', () => {
    const { renderer, layers } = setup();
    renderer.dispose();
    renderer.mount();
    expect(layers.has(LAYER)).toBe(true);
  });
});

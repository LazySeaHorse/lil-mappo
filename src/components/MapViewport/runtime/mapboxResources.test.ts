import type { Map as MapboxMap } from 'mapbox-gl';
import { describe, expect, it, vi } from 'vitest';
import {
  getGeoJSONSource,
  guardShadowCasterCheck,
  LayerPropertyWriter,
  mutateMap,
  removeLayerIfPresent,
  removeSourceIfPresent,
} from './mapboxResources';

function createMap(overrides: Record<string, unknown> = {}): MapboxMap {
  return {
    getLayer: vi.fn(),
    getSource: vi.fn(),
    isStyleLoaded: vi.fn(() => true),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    ...overrides,
  } as unknown as MapboxMap;
}

describe('guardShadowCasterCheck', () => {
  // Mirrors mapbox-gl 3.32's ShadowRenderer._hasCasterGeometry for a model source.
  function shadowRenderer(source: { type: string; getModels?: () => unknown[] }) {
    const painter = { style: { getLayerSourceCache: () => ({ getSource: () => source }) } };
    return {
      painter,
      _hasCasterGeometry(this: { painter: typeof painter }) {
        const s = this.painter.style.getLayerSourceCache().getSource();
        return (s as { getModels: () => unknown[] }).getModels().length > 0;
      },
    };
  }

  it('answers no caster for a model source still loading, on a shadow renderer the painter creates later', () => {
    const painter: { _shadowRenderer?: ReturnType<typeof shadowRenderer> } = {};
    guardShadowCasterCheck({ painter } as unknown as MapboxMap);

    const unguarded = shadowRenderer({ type: 'model' });
    expect(() => unguarded._hasCasterGeometry()).toThrow(TypeError);
    painter._shadowRenderer = shadowRenderer({ type: 'model' });
    expect(painter._shadowRenderer._hasCasterGeometry()).toBe(false);
  });

  it('guards a shadow renderer that already exists, and leaves loaded model sources to the real check', () => {
    const painter = { _shadowRenderer: shadowRenderer({ type: 'model', getModels: () => [{}] }) };
    guardShadowCasterCheck({ painter } as unknown as MapboxMap);
    expect(painter._shadowRenderer._hasCasterGeometry()).toBe(true);
  });

  it('does nothing when the internals are not there', () => {
    expect(() => guardShadowCasterCheck({} as MapboxMap)).not.toThrow();
  });
});

describe('mapbox resource helpers', () => {
  it('reports a failed mutation while the style is stable', () => {
    const map = createMap();
    const report = vi.fn();
    const error = new Error('invalid paint');

    const changed = mutateMap(
      map,
      { operation: 'setPaintProperty', phase: 'update', resourceId: 'route-1' },
      () => { throw error; },
      report,
    );

    expect(changed).toBe(false);
    expect(report).toHaveBeenCalledWith(
      { operation: 'setPaintProperty', phase: 'update', resourceId: 'route-1' },
      error,
    );
  });

  it('does not report the expected race while a style is being replaced', () => {
    const map = createMap({ isStyleLoaded: vi.fn(() => false) });
    const report = vi.fn();

    mutateMap(
      map,
      { operation: 'removeLayer', phase: 'cleanup', resourceId: 'route-1' },
      () => { throw new Error('style changed'); },
      report,
    );

    expect(report).not.toHaveBeenCalled();
  });

  it('removes only resources that are present', () => {
    const removeLayer = vi.fn();
    const removeSource = vi.fn();
    const map = createMap({
      getLayer: vi.fn((id: string) => id === 'present-layer' ? { id } : undefined),
      getSource: vi.fn((id: string) => id === 'present-source' ? { type: 'geojson' } : undefined),
      removeLayer,
      removeSource,
    });

    removeLayerIfPresent(map, 'missing-layer');
    removeLayerIfPresent(map, 'present-layer');
    removeSourceIfPresent(map, 'missing-source');
    removeSourceIfPresent(map, 'present-source');

    expect(removeLayer).toHaveBeenCalledOnce();
    expect(removeLayer).toHaveBeenCalledWith('present-layer');
    expect(removeSource).toHaveBeenCalledOnce();
    expect(removeSource).toHaveBeenCalledWith('present-source');
  });

  it('returns only GeoJSON sources', () => {
    const geojson = { type: 'geojson', setData: vi.fn() };
    const map = createMap({
      getSource: vi.fn((id: string) => id === 'geojson' ? geojson : { type: 'vector' }),
    });

    expect(getGeoJSONSource(map, 'geojson')).toBe(geojson);
    expect(getGeoJSONSource(map, 'vector')).toBeUndefined();
  });
});

describe('LayerPropertyWriter', () => {
  const makeCache = () => ({ color: '' as string, shown: true });

  it('skips writes that match the cache and retries after a failed write', () => {
    const setPaintProperty = vi.fn()
      .mockImplementationOnce(() => { throw new Error('layer missing'); })
      .mockImplementation(() => undefined);
    const map = createMap({ setPaintProperty, isStyleLoaded: vi.fn(() => false) });
    const writer = new LayerPropertyWriter(map, makeCache);

    writer.setPaint('layer', 'line-color', '#f00', 'color', '#f00');
    expect(writer.cache.color).toBe('');

    writer.setPaint('layer', 'line-color', '#f00', 'color', '#f00');
    writer.setPaint('layer', 'line-color', '#f00', 'color', '#f00');
    expect(setPaintProperty).toHaveBeenCalledTimes(2);
    expect(writer.cache.color).toBe('#f00');
  });

  it('writes layout properties and forgets the cache on reset', () => {
    const setLayoutProperty = vi.fn();
    const writer = new LayerPropertyWriter(createMap({ setLayoutProperty }), makeCache);

    writer.setLayout('layer', 'visibility', 'none', 'shown', false);
    writer.setLayout('layer', 'visibility', 'none', 'shown', false);
    expect(setLayoutProperty).toHaveBeenCalledTimes(1);

    writer.reset();
    writer.setLayout('layer', 'visibility', 'none', 'shown', false);
    expect(setLayoutProperty).toHaveBeenCalledTimes(2);
  });

  it('clamps every *-opacity paint value to 0-1, since Mapbox rejects others without throwing', () => {
    const setPaintProperty = vi.fn();
    const writer = new LayerPropertyWriter(createMap({ setPaintProperty }), () => ({ a: -1, b: -1, c: -1, d: -1, w: -1 }));

    writer.setPaint('layer', 'fill-opacity', 1.0000000000000002, 'a', 1.0000000000000002);
    writer.setPaint('layer', 'line-opacity', -0.2, 'b', -0.2);
    writer.setPaint('layer', 'raster-opacity', 0.4, 'c', 0.4);
    writer.setPaint('layer', 'circle-stroke-opacity', 3, 'd', 3);
    writer.setPaint('layer', 'line-width', 12, 'w', 12);

    expect(setPaintProperty.mock.calls).toEqual([
      ['layer', 'fill-opacity', 1],
      ['layer', 'line-opacity', 0],
      ['layer', 'raster-opacity', 0.4],
      ['layer', 'circle-stroke-opacity', 1],
      ['layer', 'line-width', 12],
    ]);
  });

  it('passes opacity expressions through untouched', () => {
    const setPaintProperty = vi.fn();
    const writer = new LayerPropertyWriter(createMap({ setPaintProperty }), () => ({ e: '' }));
    const expression = ['coalesce', ['feature-state', 'opacity'], 0];
    writer.setPaint('layer', 'fill-opacity', expression, 'e', 'expr');
    expect(setPaintProperty).toHaveBeenCalledWith('layer', 'fill-opacity', expression);
  });
});

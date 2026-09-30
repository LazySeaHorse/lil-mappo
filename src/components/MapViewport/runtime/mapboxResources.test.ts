import type { Map as MapboxMap } from 'mapbox-gl';
import { describe, expect, it, vi } from 'vitest';
import {
  getGeoJSONSource,
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
});

import type { Map as MapboxMap } from 'mapbox-gl';
import { describe, expect, it, vi } from 'vitest';
import {
  getGeoJSONSource,
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

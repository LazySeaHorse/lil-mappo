import type { Map as MapboxMap } from 'mapbox-gl';
import { describe, expect, it } from 'vitest';
import { LABEL_CATEGORIES, STANDARD_CAPABILITIES } from '@/config/mapbox';
import { detectRuntimeCapabilities } from './mapUtils';

function mapWithLayers(ids: string[]): MapboxMap {
  return { getStyle: () => ({ version: 8, sources: {}, layers: ids.map((id) => ({ id })) }) } as unknown as MapboxMap;
}

describe('detectRuntimeCapabilities', () => {
  it('returns exactly the 5 config-backed categories for Standard', () => {
    const caps = detectRuntimeCapabilities(mapWithLayers(['road-label']), 'standard');
    expect(caps.labelGroups.map((g) => g.id)).toEqual(['place', 'admin', 'road', 'transit', 'poi']);
    expect(caps.labelGroups.every((g) => g.configProperty)).toBe(true);
    expect(caps).toEqual(STANDARD_CAPABILITIES);
  });

  it('returns only categories matching loaded layers for classic styles', () => {
    const caps = detectRuntimeCapabilities(
      mapWithLayers(['land', 'admin-0-boundary', 'road-label-simple', 'settlement-major-label', 'poi-label', 'water-point-label', 'road-simple']),
      'streets',
    );
    expect(caps.labelGroups.map((g) => g.id)).toEqual(['place', 'admin', 'road', 'poi', 'water']);
    const road = caps.labelGroups.find((g) => g.id === 'road');
    expect(road?.layerPatterns).toEqual(LABEL_CATEGORIES.find((c) => c.id === 'road')?.layerPatterns);
    expect(caps.colorCustomization).toBe(true);
  });

  it('matches case-insensitively and yields no groups when nothing matches', () => {
    expect(detectRuntimeCapabilities(mapWithLayers(['POI-Label']), 'x').labelGroups.map((g) => g.id)).toEqual(['poi']);
    expect(detectRuntimeCapabilities(mapWithLayers(['background', 'fill-1']), 'x').labelGroups).toEqual([]);
  });

  it('does not match non-label transit or ferry geometry', () => {
    const ids = ['ferry', 'transit-line', 'road-intersection'];
    expect(detectRuntimeCapabilities(mapWithLayers(ids), 'x').labelGroups).toEqual([]);
  });

  it('detects navigation-style layer ids', () => {
    const ids = ['road-label-small', 'road-shields-black', 'motorway-junction', 'poi-scalerank1', 'rail-label-minor', 'airport-label', 'place-city-lg-n', 'place-neighbourhood', 'state-label-sm', 'country-label-lg', 'block-number-label'];
    expect(detectRuntimeCapabilities(mapWithLayers(ids), 'nav').labelGroups.map((g) => g.id)).toEqual(['place', 'road', 'transit', 'poi', 'building']);
  });
});

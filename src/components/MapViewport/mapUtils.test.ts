import type { Map as MapboxMap } from 'mapbox-gl';
import { describe, expect, it } from 'vitest';
import { LABEL_CATEGORIES, STANDARD_CAPABILITIES } from '@/config/mapbox';
import { detectRuntimeCapabilities } from './mapUtils';

function mapWithLayers(ids: string[], sources: string[] = [], vectorLayerIds?: string[]): MapboxMap {
  return {
    getStyle: () => ({ version: 8, sources: {}, layers: ids.map((id) => ({ id })) }),
    getSource: (id: string) => (sources.includes(id) ? { vectorLayerIds } : undefined),
  } as unknown as MapboxMap;
}

/** A map whose style draws `sourceLayers` from the composite source. */
function mapWithCompositeLayers(sourceLayers: string[], vectorLayerIds?: string[]): MapboxMap {
  return {
    getStyle: () => ({
      version: 8,
      sources: {},
      layers: sourceLayers.map((layer) => ({ id: layer, source: 'composite', 'source-layer': layer })),
    }),
    getSource: () => ({ vectorLayerIds }),
  } as unknown as MapboxMap;
}

describe('detectRuntimeCapabilities', () => {
  it('returns exactly the 5 config-backed categories for Standard', () => {
    const caps = detectRuntimeCapabilities(mapWithLayers(['road-label']), 'standard');
    expect(caps.labelGroups.map((g) => g.id)).toEqual(['place', 'admin', 'road', 'transit', 'poi']);
    expect(caps.labelGroups.every((g) => g.configProperty)).toBe(true);
    expect(caps).toEqual(STANDARD_CAPABILITIES);
    expect(caps.buildings3d).toBe(true);
  });

  it('offers 3D buildings only when the composite source has a building layer', () => {
    // Streets draws buildings from the composite source
    expect(detectRuntimeCapabilities(mapWithCompositeLayers(['road', 'building']), 'streets').buildings3d).toBe(true);
    // Bubble, Neon Glow, Water World and Black Marble have a composite source but no building layer
    expect(detectRuntimeCapabilities(mapWithCompositeLayers(['water', 'landcover']), 'bubble').buildings3d).toBe(false);
    expect(detectRuntimeCapabilities(mapWithCompositeLayers(['water'], ['water', 'depth']), 'blackMarble').buildings3d).toBe(false);
    // satellite-v9 is raster only; vintage ships its own vector source
    expect(detectRuntimeCapabilities(mapWithLayers(['satellite'], ['mapbox']), 'satellite').buildings3d).toBe(false);
    expect(detectRuntimeCapabilities(mapWithLayers(['water'], ['custom-tiles']), 'vintage').buildings3d).toBe(false);
  });

  it('finds a building layer the source lists even when the style draws none', () => {
    // satellite-streets uses the Streets tileset but only draws labels from it
    expect(detectRuntimeCapabilities(mapWithCompositeLayers(['place_label']), 'satelliteStreets').buildings3d).toBe(false);
    expect(detectRuntimeCapabilities(mapWithCompositeLayers(['place_label'], ['place_label', 'building']), 'satelliteStreets').buildings3d).toBe(true);
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

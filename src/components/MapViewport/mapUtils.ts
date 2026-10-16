import { LABEL_CATEGORIES, STANDARD_CAPABILITIES, getStandardLabelGroups, isStandardBasemap, type MapStyleCapabilities } from '@/config/mapbox';
import { shortPlaceName } from '@/services/nominatim';
import type { PickResult } from '@/store/slices/types';
import type { Map as MapboxMap } from 'mapbox-gl';

interface ClickFeature {
  layer?: { id: string };
  geometry: GeoJSON.Geometry;
  properties?: Record<string, unknown> | null;
}

interface ClickTargetEvent {
  lngLat: { lng: number; lat: number };
  features?: readonly ClickFeature[];
}

/**
 * Whether the style's `composite` source has the `building` source layer that BasemapController
 * extrudes. Many styles have a `composite` source without one (Bubble, Neon Glow, Water World,
 * Black Marble), and extruding a missing source layer logs a validation error. The source lists
 * its layers once its metadata loads, so a style that draws buildings is detected at once and the
 * rest when `sourcedata` reports the metadata.
 */
export function compositeHasBuildings(map: MapboxMap): boolean {
  const composite = map.getSource('composite') as { vectorLayerIds?: string[] } | undefined;
  if (!composite) return false;
  if (composite.vectorLayerIds) return composite.vectorLayerIds.includes('building');
  return (map.getStyle()?.layers ?? []).some(
    (layer) => 'source' in layer && layer.source === 'composite' && 'source-layer' in layer && layer['source-layer'] === 'building',
  );
}

/**
 * Detects capabilities for the loaded style.
 * Standard returns its fixed config-driven label categories (its layers live inside the
 * `basemap` import, unreachable via getStyle().layers). Classic styles return only the
 * canonical label categories that match at least one layer in the loaded style, and offer
 * 3D buildings only when `compositeHasBuildings` finds the layer to extrude them from.
 */
export function detectRuntimeCapabilities(map: MapboxMap, mapStyle: string): MapStyleCapabilities {
  if (isStandardBasemap(mapStyle)) return { ...STANDARD_CAPABILITIES, labelGroups: getStandardLabelGroups() };

  const layerIds = (map.getStyle()?.layers ?? []).map((l) => l.id.toLowerCase());
  const labelGroups = LABEL_CATEGORIES
    .filter((c) => c.layerPatterns.some((p) => layerIds.some((id) => id.includes(p.toLowerCase()))))
    .map((c) => ({ id: c.id, label: c.label, layerPatterns: [...c.layerPatterns] }));

  return {
    labelGroups,
    buildings3d: compositeHasBuildings(map),
    landmarks3d: false,
    trees3d: false,
    facades3d: false,
    timeOfDayPreset: false,
    colorCustomization: true,
  };
}

/**
 * Resolves a map click to either a search result feature or raw coordinates.
 */
export function resolveClickTarget(e: ClickTargetEvent, fallbackName = 'Point'): PickResult {
  const searchFeature = e.features?.find((feature) => feature.layer?.id === 'search-results-circles');
  if (searchFeature?.geometry.type === 'Point') {
    const [longitude, latitude] = searchFeature.geometry.coordinates;
    const rawName = searchFeature.properties?.name;
    const name = typeof rawName === 'string' ? shortPlaceName(rawName) : fallbackName;

    if (typeof longitude === 'number' && typeof latitude === 'number') {
      return {
        lngLat: [longitude, latitude],
        name,
      };
    }
  }

  const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
  return { lngLat, name: `${lngLat[0].toFixed(5)}, ${lngLat[1].toFixed(5)}` };
}

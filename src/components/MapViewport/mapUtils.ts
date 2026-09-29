import { LABEL_CATEGORIES, STANDARD_CAPABILITIES, getStandardLabelGroups, type MapStyleCapabilities } from '@/config/mapbox';
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
 * Detects capabilities for the loaded style.
 * Standard returns its fixed config-driven label categories (its layers live inside the
 * `basemap` import, unreachable via getStyle().layers). Classic styles return only the
 * canonical label categories that match at least one layer in the loaded style.
 */
export function detectRuntimeCapabilities(map: MapboxMap, mapStyle: string): MapStyleCapabilities {
  if (mapStyle === 'standard') return { ...STANDARD_CAPABILITIES, labelGroups: getStandardLabelGroups() };

  const layerIds = (map.getStyle()?.layers ?? []).map((l) => l.id.toLowerCase());
  const labelGroups = LABEL_CATEGORIES
    .filter((c) => c.layerPatterns.some((p) => layerIds.some((id) => id.includes(p.toLowerCase()))))
    .map((c) => ({ id: c.id, label: c.label, layerPatterns: [...c.layerPatterns] }));

  return {
    labelGroups,
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
    const name = typeof rawName === 'string' ? rawName.split(',')[0] : fallbackName;

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

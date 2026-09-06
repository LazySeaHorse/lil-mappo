import type { MapStyleCapabilities } from '@/config/mapbox';
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
 * Detects capabilities for any Mapbox style by scanning the loaded style's label layer IDs.
 * Dynamically creates label groups from actual layers, formatting names for display.
 * For Standard style (which uses Config API instead of layers), returns predefined groups.
 * Works for built-in and custom styles.
 */
export function detectRuntimeCapabilities(map: MapboxMap, mapStyle: string): MapStyleCapabilities {
  // Standard style uses Config API, not traditional label layers
  if (mapStyle === 'standard') {
    return {
      labelGroups: [
        { id: 'place', label: 'Place Names', layerPatterns: ['country-label', 'state-label', 'settlement-major-label', 'settlement-minor-label', 'settlement-subdivision-label', 'continent-label'] },
        { id: 'admin', label: 'Country & State Borders', layerPatterns: ['admin'] },
        { id: 'road', label: 'Road Labels', layerPatterns: ['road-label', 'road-number-shield'] },
        { id: 'transit', label: 'Transit', layerPatterns: ['transit-label'] },
        { id: 'poi', label: 'Points of Interest', layerPatterns: ['poi-label'] },
        { id: 'water', label: 'Water Names', layerPatterns: ['water-point-label', 'water-line-label'] },
        { id: 'natural', label: 'Natural Features', layerPatterns: ['natural-point-label', 'natural-line-label'] },
        { id: 'building', label: 'Building Names', layerPatterns: ['building-number-label'] },
      ],
      landmarks3d: true,
      trees3d: true,
      facades3d: true,
      timeOfDayPreset: true,
      colorCustomization: false,
    };
  }

  // For other styles, detect from actual label layers
  const layers = map.getStyle()?.layers ?? [];
  const labelLayers = layers.filter((l) => {
    const id = l.id.toLowerCase();
    return id.includes('label') || id.includes('shield');
  });

  // Format layer ID to human-readable label
  // e.g., "settlement-subdivision-label" → "Settlement Subdivision"
  const formatLayerName = (layerId: string): string => {
    return layerId
      .toLowerCase()
      .replace(/-label$/, '') // Remove trailing "-label"
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const detectedLabelGroups = labelLayers.map((layer) => ({
    id: layer.id.toLowerCase().replace(/-label$/, ''), // Use formatted ID without "-label"
    label: formatLayerName(layer.id),
    layerPatterns: [layer.id], // Each group targets exactly its layer
  }));

  return {
    labelGroups: detectedLabelGroups,
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

import { useProjectStore } from '@/store/useProjectStore';
import type { RouteItem, CalloutItem } from '@/store/types';
import type { MapStyleCapabilities } from '@/config/mapbox';
import { toast } from 'sonner';

/**
 * Detects capabilities for any Mapbox style by scanning the loaded style's label layer IDs.
 * Dynamically creates label groups from actual layers, formatting names for display.
 * For Standard style (which uses Config API instead of layers), returns predefined groups.
 * Works for built-in and custom styles.
 */
export function detectRuntimeCapabilities(map: any, mapStyle: string): MapStyleCapabilities {
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
  const labelLayers = layers.filter((l: any) => {
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

  const detectedLabelGroups = labelLayers.map((layer: any) => ({
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
export function resolveClickTarget(e: any, editingPoint: string): { lngLat: [number, number]; name: string } {
  const searchFeature = e.features?.find((f: any) => f.layer.id === 'search-results-circles');
  if (searchFeature) {
    return {
      lngLat: searchFeature.geometry.coordinates as [number, number],
      name: searchFeature.properties.name?.split(',')[0] || (editingPoint === 'start' ? 'Start' : 'End'),
    };
  }
  const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
  return { lngLat, name: `${lngLat[0].toFixed(4)}, ${lngLat[1].toFixed(4)}` };
}

/**
 * Applies the result of a map pick to either a draft or an existing item.
 */
export function applyPickResult(
  s: ReturnType<typeof useProjectStore.getState>,
  editingPoint: string,
  target: { lngLat: [number, number]; name: string },
  updateItem: (id: string, patch: any) => void,
) {
  const { lngLat, name } = target;

  if (editingPoint === 'callout') {
    const editingId = s.editingItemId;
    if (editingId) {
      const item = s.items[editingId] as CalloutItem;
      if (item) {
        const updates: Partial<CalloutItem> = { lngLat };
        if (item.linkTitleToLocation) updates.title = name;
        updateItem(editingId, updates as any);
      }
    } else {
      s.setDraftCallout({ lngLat, name });
    }
  } else if (s.editingItemId) {
    const routeItem = s.items[s.editingItemId] as RouteItem;
    if (routeItem) {
      const calc = routeItem.calculation || { mode: 'manual', startPoint: [0, 0], endPoint: [0, 0] };
      updateItem(s.editingItemId, { calculation: { ...calc, [editingPoint === 'start' ? 'startPoint' : 'endPoint']: lngLat } } as any);
    }
  } else {
    if (editingPoint === 'start') s.setDraftStart({ lngLat, name });
    else s.setDraftEnd({ lngLat, name });
  }
}

import { LABEL_CATEGORIES, STANDARD_CAPABILITIES, getStandardLabelGroups, isStandardBasemap, type MapStyleCapabilities } from '@/config/mapbox';
import type { PickResult } from '@/store/slices/types';
import type { Map as MapboxMap } from 'mapbox-gl';

interface ClickTargetEvent {
  lngLat: { lng: number; lat: number };
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
    buildings3d: false,
    landmarks3d: false,
    trees3d: false,
    facades3d: false,
    timeOfDayPreset: false,
    colorCustomization: true,
  };
}

/** A map click as a picked point, labelled with its coordinates (a click names no place). */
export function resolveClickTarget(e: ClickTargetEvent): PickResult {
  const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
  return { lngLat, name: `${lngLat[0].toFixed(5)}, ${lngLat[1].toFixed(5)}` };
}

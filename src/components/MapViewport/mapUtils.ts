import { LABEL_CATEGORIES, STANDARD_CAPABILITIES, getStandardLabelGroups, isStandardBasemap, type MapStyleCapabilities } from '@/config/mapbox';
import { classicColorRoles, type RecolorLayer } from '@/customMapStyles/classicRecolor';
import type { PickResult } from '@/store/slices/types';
import { useProjectStore } from '@/store/useProjectStore';
import type { Map as MapboxMap } from 'mapbox-gl';

interface ClickTargetEvent {
  lngLat: { lng: number; lat: number };
  /** Where the click landed on the map canvas, in CSS pixels. */
  point?: { x: number; y: number };
  /** The map that was clicked. */
  target?: MapboxMap;
}

/**
 * Detects capabilities for the loaded style.
 * Standard returns its fixed config-driven label categories (its layers live inside the
 * `basemap` import, unreachable via getStyle().layers). Classic styles return only the
 * canonical label categories that match at least one layer in the loaded style, and the
 * colour roles a custom style can change on its layers.
 */
export function detectRuntimeCapabilities(map: MapboxMap, mapStyle: string): MapStyleCapabilities {
  if (isStandardBasemap(mapStyle)) return { ...STANDARD_CAPABILITIES, labelGroups: getStandardLabelGroups() };

  const layers = map.getStyle()?.layers ?? [];
  const layerIds = layers.map((l) => l.id.toLowerCase());
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
    colorRoles: classicColorRoles(layers as RecolorLayer[]),
  };
}

/** How far from the click, in pixels, a place label may be to name the picked point. */
const NAMING_RADIUS_PX = 32;
/** The label groups (see `LABEL_CATEGORIES`) whose labels name a point: towns and the like, and points of interest. */
const NAMING_GROUPS = ['place', 'poi'];
/** Standard's featuresets (in its `basemap` import) that carry those labels. */
const STANDARD_NAMING_FEATURESETS = ['place-labels', 'poi'];

/** The name a label feature shows: English where the style has it (as the Mapbox styles draw it), else the local name. */
function labelName(properties: Record<string, unknown> | null | undefined): string | null {
  for (const key of ['name_en', 'name']) {
    const value = properties?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** The label features rendered in a box around `point`, from the layers or featuresets that hold place and POI labels. */
function renderedLabels(map: MapboxMap, box: [[number, number], [number, number]]) {
  if (isStandardBasemap(useProjectStore.getState().mapStyle)) {
    // Standard's layers live inside the basemap import: its featuresets are what can be queried.
    return STANDARD_NAMING_FEATURESETS.flatMap((featuresetId) =>
      map.queryRenderedFeatures(box, { target: { featuresetId, importId: 'basemap' } }));
  }
  const patterns = LABEL_CATEGORIES.filter((c) => NAMING_GROUPS.includes(c.id)).flatMap((c) => c.layerPatterns);
  const layers = (map.getStyle()?.layers ?? [])
    .filter((layer) => layer.type === 'symbol' && patterns.some((p) => layer.id.toLowerCase().includes(p)))
    .map((layer) => layer.id);
  return layers.length ? map.queryRenderedFeatures(box, { layers }) : [];
}

/** The name of the place label the map shows nearest to the click, or null when no named label is close enough. */
function nearestLabelName(map: MapboxMap, point: { x: number; y: number }): string | null {
  const r = NAMING_RADIUS_PX;
  let best: { name: string; distance: number } | null = null;
  for (const feature of renderedLabels(map, [[point.x - r, point.y - r], [point.x + r, point.y + r]])) {
    const name = labelName(feature.properties);
    if (!name || feature.geometry.type !== 'Point') continue;
    const [lng, lat] = feature.geometry.coordinates;
    const at = map.project([lng, lat]);
    const distance = Math.hypot(at.x - point.x, at.y - point.y);
    if (distance <= r && (!best || distance < best.distance)) best = { name, distance };
  }
  return best?.name ?? null;
}

/**
 * A map click as a picked point: named after the nearest place or point of
 * interest label on the map, else labelled with its coordinates. The point is
 * always exactly where the click was.
 */
export function resolveClickTarget(e: ClickTargetEvent): PickResult {
  const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
  let label: string | null = null;
  if (e.target && e.point) {
    try {
      label = nearestLabelName(e.target, e.point);
    } catch {
      // A map that cannot be queried (style not ready, no such featureset) names nothing.
    }
  }
  return { lngLat, name: label ?? `${lngLat[0].toFixed(5)}, ${lngLat[1].toFixed(5)}` };
}

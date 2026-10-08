import { difference } from '@turf/difference';
import { featureCollection, polygon } from '@turf/helpers';
import { union } from '@turf/union';
import type { BoundaryItem } from '@/store/types';
import { resolveBoundaryTiming } from './boundaryTiming';

type AreaGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon;
type AreaFeature = GeoJSON.Feature<AreaGeometry>;

/**
 * Outer ring of the mask polygon. Latitude stops at the Web Mercator limit rather than
 * +-90: Mapbox tiles geojson in Web Mercator, which has no rows beyond 85.0511, so a ring
 * out to the poles would be clipped there anyway (and a vertex at exactly 90 projects to
 * infinity). Globe view tiles the same way, so polar caps beyond the limit are not masked.
 */
const MAX_LAT = 85.0511;
const WORLD_RING: GeoJSON.Position[] = [
  [-180, -MAX_LAT],
  [180, -MAX_LAT],
  [180, MAX_LAT],
  [-180, MAX_LAT],
  [-180, -MAX_LAT],
];

export const DEFAULT_MASK_COLOR = '#0b0f19';

export interface ActiveMask {
  id: string;
  geometry: GeoJSON.Geometry;
  color: string;
  /** maskOpacity scaled by the boundary's fill progress. */
  opacity: number;
}

/**
 * The masked boundaries that are drawing right now, in the order given. Visibility and
 * opacity follow the fill's timing; a boundary with no fill progress cuts no hole.
 * `boundaries` is in item order, so the first entry is the topmost one.
 */
export function resolveActiveMasks(
  boundaries: readonly BoundaryItem[],
  timeFor: (id: string) => number,
): ActiveMask[] {
  const active: ActiveMask[] = [];
  for (const boundary of boundaries) {
    const { geojson: geometry, style } = boundary;
    if (!geometry || boundary.resolveStatus !== 'resolved' || !style.maskOutside) continue;
    const factor = resolveBoundaryTiming(boundary, timeFor(boundary.id)).fillFactor;
    const opacity = Math.max(0, Math.min(1, style.maskOpacity ?? 0.85)) * factor;
    if (!(opacity > 0)) continue;
    active.push({ id: boundary.id, geometry, color: style.maskColor ?? DEFAULT_MASK_COLOR, opacity });
  }
  return active;
}

/** One shared layer: the strongest mask sets the opacity, the topmost sets the color. */
export function resolveMaskPaint(active: readonly ActiveMask[]): { color: string; opacity: number } {
  if (active.length === 0) return { color: DEFAULT_MASK_COLOR, opacity: 0 };
  return { color: active[0].color, opacity: Math.max(...active.map((mask) => mask.opacity)) };
}

const geometryIds = new WeakMap<object, number>();
let nextGeometryId = 1;

/** Identity of the set of holes: ids plus geometry references, so an edited outline re-uploads. */
export function maskSetKey(active: readonly ActiveMask[]): string {
  return active
    .map(({ id, geometry }) => {
      let ref = geometryIds.get(geometry);
      if (ref === undefined) geometryIds.set(geometry, (ref = nextGeometryId++));
      return `${id}:${ref}`;
    })
    .join('|');
}

function toAreaFeature(geometry: GeoJSON.Geometry): AreaFeature | null {
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return null;
  return { type: 'Feature', properties: {}, geometry };
}

/**
 * World polygon minus the union of `geometries`. Unioning first keeps overlapping
 * boundaries from producing overlapping holes (which earcut cannot triangulate), and
 * subtracting handles enclaves (they stay masked) and nested islands. Returns null when
 * there is nothing to cut or the geometries cannot be combined.
 */
export function buildMaskFeature(geometries: readonly GeoJSON.Geometry[]): AreaFeature | null {
  const areas = geometries.map(toAreaFeature).filter((area): area is AreaFeature => area !== null);
  if (areas.length === 0) return null;
  try {
    const holes = areas.length === 1 ? areas[0] : union(featureCollection(areas));
    if (!holes) return null;
    return difference(featureCollection<AreaGeometry>([polygon([WORLD_RING]), holes]));
  } catch (error) {
    console.warn('[map:update] boundary mask geometry failed', error);
    return null;
  }
}

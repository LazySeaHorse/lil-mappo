import { difference } from '@turf/difference';
import { featureCollection, polygon } from '@turf/helpers';
import { intersect } from '@turf/intersect';
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

/**
 * Overlap, as a share of the smallest boundary, below which boundaries count as
 * disjoint. Neighbouring outlines rarely share their border exactly, and splitting off
 * those slivers would cost a clipping pass per pair for nothing visible.
 */
const OVERLAP_TOLERANCE = 0.01;

/**
 * From this mask opacity on, labels and 3D objects under the mask are removed instead
 * of dimmed. A fill cannot cover labels on the globe or with terrain (Mapbox draws every
 * fill before any label there), and a darker mask than this reads as "hidden" anyway.
 */
export const LABEL_HIDE_OPACITY = 0.4;

export interface ActiveMask {
  id: string;
  geometry: GeoJSON.Geometry;
  color: string;
  /** The boundary's maskOpacity (0-1): how dark it makes the outside once fully drawn. */
  opacity: number;
  /** The fill progress (0-1): how far the mask has come in, and how far this boundary's own area is let out of other masks. */
  reveal: number;
}

/**
 * The masked boundaries that are drawing right now, in the order given. Both the mask
 * and the reveal follow the fill's timing; a boundary with no fill progress takes no part.
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
    const reveal = resolveBoundaryTiming(boundary, timeFor(boundary.id)).fillFactor;
    const opacity = Math.max(0, Math.min(1, style.maskOpacity ?? 0.85));
    if (!(opacity * reveal > 0)) continue;
    active.push({ id: boundary.id, geometry, color: style.maskColor ?? DEFAULT_MASK_COLOR, opacity, reveal });
  }
  return active;
}

/**
 * How one region of the mask is painted. The masks it lies outside of add up, capped at
 * the darkest one's maskOpacity: one boundary fading out while the next fades in hands
 * the dark over without the world brightening in between. That is lightened by the
 * reveal of every boundary the region lies inside, so a second boundary's area brightens
 * as its fill comes in and darkens again as it leaves, instead of popping open or shut.
 * The color is the strongest mask's (the topmost wins a tie).
 */
export function resolveRegionPaint(
  inside: readonly string[],
  active: readonly ActiveMask[],
): { opacity: number; color: string } {
  let strongest: ActiveMask | null = null;
  let strongestStrength = 0;
  let total = 0;
  let cap = 0;
  let remaining = 1;
  for (const mask of active) {
    if (inside.includes(mask.id)) {
      remaining *= 1 - mask.reveal;
      continue;
    }
    const strength = mask.opacity * mask.reveal;
    total += strength;
    cap = Math.max(cap, mask.opacity);
    if (!strongest || strength > strongestStrength) {
      strongest = mask;
      strongestStrength = strength;
    }
  }
  if (!strongest) return { opacity: 0, color: DEFAULT_MASK_COLOR };
  return { opacity: Math.min(cap, total) * remaining, color: strongest.color };
}

const geometryIds = new WeakMap<object, number>();
let nextGeometryId = 1;

/** Identity of the set of holes: ids plus geometry references, so an edited outline re-uploads. */
export function maskSetKey(active: readonly Pick<ActiveMask, 'id' | 'geometry'>[]): string {
  return active
    .map(({ id, geometry }) => {
      let ref = geometryIds.get(geometry);
      if (ref === undefined) geometryIds.set(geometry, (ref = nextGeometryId++));
      return `${id}:${ref}`;
    })
    .join('|');
}

export interface MaskRegion {
  /** Feature id in the mask source; 0 is everything outside the boundaries. */
  id: number;
  /** Ids of the boundaries this region lies inside. */
  inside: readonly string[];
}

export interface MaskRegions {
  data: GeoJSON.FeatureCollection<AreaGeometry>;
  regions: MaskRegion[];
}

interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Piece {
  feature: AreaFeature;
  bbox: Bbox;
  inside: string[];
}

function toAreaFeature(geometry: GeoJSON.Geometry): AreaFeature | null {
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return null;
  return { type: 'Feature', properties: {}, geometry };
}

function bboxOf({ geometry }: AreaFeature): Bbox {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const rings of polygons) {
    for (const [x, y] of rings[0] ?? []) {
      if (x < box.minX) box.minX = x;
      if (x > box.maxX) box.maxX = x;
      if (y < box.minY) box.minY = y;
      if (y > box.maxY) box.maxY = y;
    }
  }
  return box;
}

function ringArea(ring: GeoJSON.Position[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(sum / 2);
}

/** Planar area in square degrees; only ever compared with other areas of the same boundaries. */
function areaOf({ geometry }: AreaFeature): number {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.reduce(
    (total, rings) => total + rings.reduce((sum, ring, index) => sum + (index === 0 ? ringArea(ring) : -ringArea(ring)), 0),
    0,
  );
}

function bboxesOverlap(a: Bbox, b: Bbox): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

function piece(feature: AreaFeature, inside: string[]): Piece {
  return { feature, bbox: bboxOf(feature), inside };
}

/**
 * Splits the boundaries into pieces that each lie inside the same set of them, so where
 * they overlap (a region inside its country) the overlap knows both. Pairs whose
 * bounding boxes do not meet skip the clipping.
 */
function splitByOverlap(areas: readonly { id: string; feature: AreaFeature }[]): Piece[] {
  let pieces: Piece[] = [];
  for (const area of areas) {
    const areaBbox = bboxOf(area.feature);
    const next: Piece[] = [];
    let rest: AreaFeature | null = area.feature;
    for (const existing of pieces) {
      const overlap = bboxesOverlap(existing.bbox, areaBbox)
        ? intersect(featureCollection<AreaGeometry>([existing.feature, area.feature]))
        : null;
      if (!overlap) {
        next.push(existing);
        continue;
      }
      next.push(piece(overlap, [...existing.inside, area.id]));
      const outside = difference(featureCollection<AreaGeometry>([existing.feature, area.feature]));
      if (outside) next.push(piece(outside, existing.inside));
      rest = rest && difference(featureCollection<AreaGeometry>([rest, existing.feature]));
    }
    if (rest) next.push(piece(rest, [area.id]));
    pieces = next;
  }
  return pieces;
}

/**
 * The mask's geometry: region 0 is the world minus every hole (unioned first, so
 * overlapping boundaries do not produce overlapping holes, which earcut cannot
 * triangulate; enclaves stay masked), then one region per piece of the holes. Each
 * region is painted on its own (`resolveRegionPaint`) through feature state. Boundaries
 * that do not overlap (judged from the union's area) are their own pieces, so only
 * nested or overlapping ones pay for splitting. Returns null when there is nothing to
 * cut or the geometries cannot be combined.
 */
export function buildMaskRegions(holes: readonly Pick<ActiveMask, 'id' | 'geometry'>[]): MaskRegions | null {
  const areas = holes
    .map(({ id, geometry }) => ({ id, feature: toAreaFeature(geometry) }))
    .filter((area): area is { id: string; feature: AreaFeature } => area.feature !== null);
  if (areas.length === 0) return null;
  try {
    const all = areas.length === 1 ? areas[0].feature : union(featureCollection(areas.map((area) => area.feature)));
    if (!all) return null;
    const outside = difference(featureCollection<AreaGeometry>([polygon([WORLD_RING]), all]));
    const sizes = areas.map((area) => areaOf(area.feature));
    const overlap = sizes.reduce((total, size) => total + size, 0) - areaOf(all);
    const pieces = overlap > OVERLAP_TOLERANCE * Math.min(...sizes)
      ? splitByOverlap(areas)
      : areas.map((area) => piece(area.feature, [area.id]));

    const features: AreaFeature[] = [];
    const regions: MaskRegion[] = [];
    if (outside) {
      features.push({ ...outside, id: 0 });
      regions.push({ id: 0, inside: [] });
    }
    pieces.forEach(({ feature, inside }, index) => {
      features.push({ type: 'Feature', id: index + 1, properties: {}, geometry: feature.geometry });
      regions.push({ id: index + 1, inside });
    });
    return { data: featureCollection(features), regions };
  } catch (error) {
    console.warn('[map:update] boundary mask geometry failed', error);
    return null;
  }
}

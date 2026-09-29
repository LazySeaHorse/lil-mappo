import bezierSpline from '@turf/bezier-spline';
import type { RouteItem } from '@/store/types';
import { lineString } from '@turf/helpers';
import { truncateCoordinates } from '@/engine/geoUtils';

export interface RouteCurveOptions {
  curved?: boolean;
  sharpness?: number; // 0 to 1, default 0.85
  resolution?: number; // default 10000
}

/**
 * Builds a GeoJSON LineString geometry from an array of coordinates,
 * optionally applying a smooth bezier spline curve across the waypoints.
 */
export function buildRouteGeometry(
  coords: [number, number][],
  options: RouteCurveOptions = {}
): GeoJSON.LineString {
  if (!coords || coords.length < 2) {
    return {
      type: 'LineString',
      coordinates: coords ? [...coords] : [],
    };
  }

  const straightLine = lineString(coords);

  // If curve is disabled or there are fewer than 3 points, bezier spline cannot be computed
  if (!options.curved || coords.length < 3) {
    return truncateCoordinates(straightLine.geometry, 5);
  }

  try {
    const sharpness = typeof options.sharpness === 'number' && Number.isFinite(options.sharpness)
      ? Math.max(0.01, Math.min(1, options.sharpness))
      : 0.85;

    const resolution = typeof options.resolution === 'number' && Number.isFinite(options.resolution)
      ? Math.max(100, Math.min(50000, options.resolution))
      : 10000;

    const curved = bezierSpline(straightLine, { sharpness, resolution });
    return truncateCoordinates(curved.geometry, 5);
  } catch (error) {
    // If bezierSpline fails (e.g. coincident points or degenerate geometry), fallback to straight line
    console.warn('[routeCurves] Failed to compute spline, falling back to straight polyline:', error);
    return truncateCoordinates(straightLine.geometry, 5);
  }
}

/**
 * Convenience helper to produce a complete FeatureCollection.
 */
export function buildRouteFeatureCollection(
  coords: [number, number][],
  options: RouteCurveOptions = {}
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: buildRouteGeometry(coords, options),
        properties: {},
      },
    ],
  };
}

export const DEFAULT_SHARPNESS = 0.85;

export interface FreeformPatch {
  startPoint?: [number, number];
  waypoints?: [number, number][];
  endPoint?: [number, number];
  curved?: boolean;
  sharpness?: number;
}

const isPlaced = (p: [number, number] | undefined): p is [number, number] =>
  Boolean(p) && (p![0] !== 0 || p![1] !== 0);

/**
 * Applies a freeform edit (points, curve on/off, sharpness) to a route and
 * rebuilds its geometry through start → waypoints → end. The geometry is kept
 * unchanged until at least two points are placed.
 */
export function applyFreeformPatch(route: RouteItem, patch: FreeformPatch): Partial<RouteItem> {
  const calc = route.calculation ?? {
    mode: 'walk' as const,
    startPoint: [0, 0] as [number, number],
    endPoint: [0, 0] as [number, number],
  };
  const startPoint = patch.startPoint ?? calc.startPoint;
  const waypoints = patch.waypoints ?? calc.waypoints ?? [];
  const endPoint = patch.endPoint ?? calc.endPoint;
  const curved = patch.curved ?? calc.curved ?? true;
  const sharpness = patch.sharpness ?? calc.sharpness ?? DEFAULT_SHARPNESS;

  const points = [startPoint, ...waypoints, endPoint].filter(isPlaced);

  return {
    geojson: points.length >= 2 ? buildRouteFeatureCollection(points, { curved, sharpness }) : route.geojson,
    calculation: { ...calc, startPoint, waypoints, endPoint, curved, sharpness },
  };
}

/** Whether a route uses freeform point editing rather than routed directions.
 *  Walk mode is always freeform (no routing API call). */
export function isFreeformRoute(calc: RouteItem['calculation']): boolean {
  if (!calc) return false;
  return calc.mode === 'walk';
}

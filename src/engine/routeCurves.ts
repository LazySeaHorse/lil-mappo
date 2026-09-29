import bezierSpline from '@turf/bezier-spline';
import type { RouteItem, RouteVehicleConfig, WalkRouteCalculation } from '@/store/types';
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

export type WalkPatch = Partial<Pick<WalkRouteCalculation, 'points' | 'curved' | 'sharpness'>>;

/** A walk's geometry is always derived from its points; fewer than two draw nothing. */
export function buildWalkGeometry(calc: WalkRouteCalculation): GeoJSON.FeatureCollection {
  if (calc.points.length < 2) return { type: 'FeatureCollection', features: [] };
  return buildRouteFeatureCollection(calc.points, { curved: calc.curved, sharpness: calc.sharpness });
}

export function createWalkCalculation(
  points: [number, number][],
  vehicle?: RouteVehicleConfig,
): WalkRouteCalculation {
  return {
    mode: 'walk',
    points,
    curved: true,
    sharpness: DEFAULT_SHARPNESS,
    ...(vehicle ? { vehicle } : {}),
  };
}

/** Applies a walk edit and rebuilds the geometry to match it. */
export function applyWalkPatch(
  calc: WalkRouteCalculation,
  patch: WalkPatch,
): Pick<RouteItem, 'calculation' | 'geojson'> {
  const calculation = { ...calc, ...patch };
  return { calculation, geojson: buildWalkGeometry(calculation) };
}

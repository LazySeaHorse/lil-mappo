import distance from '@turf/distance';
import simplify from '@turf/simplify';
import { point } from '@turf/helpers';


/**
 * Extracts all rings (exterior and interior) from a Polygon or MultiPolygon
 * as an array of LineString-compatible coordinate arrays.
 */
export function extractLineStringsFromGeometry(geometry: GeoJSON.Geometry): number[][][] {
  const lineStrings: number[][][] = [];

  if (geometry.type === 'Polygon') {
    // A Polygon is an array of LinearRings (exterior, then holes)
    for (const ring of geometry.coordinates) {
      lineStrings.push(ring);
    }
  } else if (geometry.type === 'MultiPolygon') {
    // A MultiPolygon is an array of Polygons
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        lineStrings.push(ring);
      }
    }
  } else if (geometry.type === 'LineString') {
    lineStrings.push(geometry.coordinates);
  } else if (geometry.type === 'MultiLineString') {
    for (const line of geometry.coordinates) {
      lineStrings.push(line);
    }
  } else if (geometry.type === 'GeometryCollection') {
    for (const g of geometry.geometries) {
      lineStrings.push(...extractLineStringsFromGeometry(g));
    }
  }

  return lineStrings;
}

/**
 * Calculates the bearing between two points in degrees.
 * Guaranteed to return a finite number in [0, 360).
 */
export function calculateBearing(start: number[], end: number[]): number {
  if (
    !start ||
    !end ||
    start.length < 2 ||
    end.length < 2 ||
    !Number.isFinite(start[0]) ||
    !Number.isFinite(start[1]) ||
    !Number.isFinite(end[0]) ||
    !Number.isFinite(end[1])
  ) {
    return 0;
  }

  const toRad = (v: number) => (v * Math.PI) / 180;
  const toDeg = (v: number) => (v * 180) / Math.PI;

  const φ1 = toRad(start[1]);
  const φ2 = toRad(end[1]);
  const Δλ = toRad(end[0] - start[0]);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);

  let bearing = (toDeg(θ) + 360) % 360;
  if (Number.isNaN(bearing) || !Number.isFinite(bearing)) return 0;
  bearing = ((bearing % 360) + 360) % 360;
  if (bearing === 360 || Object.is(bearing, -0)) return 0;
  return bearing;
}

/**
 * Calculates the pitch (tilt) between two 3D points in degrees.
 * Guaranteed to return a finite number in [-90, 90].
 */
export function calculatePitch(start: number[], end: number[]): number {
  if (
    !start ||
    !end ||
    start[2] === undefined ||
    end[2] === undefined ||
    !Number.isFinite(start[2]) ||
    !Number.isFinite(end[2]) ||
    !Number.isFinite(start[0]) ||
    !Number.isFinite(start[1]) ||
    !Number.isFinite(end[0]) ||
    !Number.isFinite(end[1])
  ) {
    return 0;
  }

  let d = 0;
  try {
    d = distance(point(start.slice(0, 2)), point(end.slice(0, 2)), { units: 'meters' });
  } catch {
    d = 0;
  }

  const dz = end[2] - start[2];

  if (d === 0 || !Number.isFinite(d)) return dz > 0 ? 90 : dz < 0 ? -90 : 0;

  const pitch = (Math.atan2(dz, d) * 180) / Math.PI;
  if (Number.isNaN(pitch) || !Number.isFinite(pitch)) return 0;
  return Math.max(-90, Math.min(90, pitch));
}

/**
 * Rounds a single coordinate tuple [lng, lat, alt?] to specified decimal places.
 * Default 4 decimal places gives ~11m precision, ideal for maps while dropping unnecessary float size.
 */
export function truncateCoordinate(coord: number[], precision = 4): number[] {
  const p = Math.max(0, Math.min(15, precision));
  const factor = Math.pow(10, p);
  const c0 = coord[0] ?? 0;
  const c1 = coord[1] ?? 0;
  const r0 = Math.round(c0 * factor) / factor;
  const r1 = Math.round(c1 * factor) / factor;
  const truncated = [
    Object.is(r0, -0) ? 0 : r0,
    Object.is(r1, -0) ? 0 : r1,
  ];
  if (coord.length > 2 && coord[2] !== undefined) {
    // Altitude rounded to 1 decimal place
    const r2 = Math.round(coord[2] * 10) / 10;
    truncated.push(Object.is(r2, -0) ? 0 : r2);
  }
  return truncated;
}

/**
 * Recursively truncates coordinate precision across any GeoJSON geometry object.
 */
export function truncateCoordinates<T extends GeoJSON.Geometry>(geometry: T, precision = 4): T {
  if (!geometry || !geometry.type) return geometry;

  type NestedCoordinates = number[] | NestedCoordinates[];
  const truncateCoords = (coords: NestedCoordinates): NestedCoordinates => {
    if (!Array.isArray(coords)) return coords;
    if (typeof coords[0] === 'number') {
      return truncateCoordinate(coords as number[], precision);
    }
    return (coords as NestedCoordinates[]).map(truncateCoords);
  };

  if (geometry.type === 'GeometryCollection') {
    const gc = geometry as unknown as GeoJSON.GeometryCollection;
    return {
      ...gc,
      geometries: (gc.geometries || []).map((g) => truncateCoordinates(g, precision)),
    } as unknown as T;
  }

  return {
    ...geometry,
    coordinates: truncateCoords((geometry as unknown as { coordinates: NestedCoordinates }).coordinates),
  };
}

/**
 * Optimizes a GeoJSON geometry by running Douglas-Peucker simplification (via @turf/simplify)
 * and rounding coordinate precision (default 4 decimal places).
 */
export function optimizeGeometry<T extends GeoJSON.Geometry>(
  geometry: T,
  options?: { simplify?: boolean; tolerance?: number; precision?: number }
): T {
  if (!geometry) return geometry;

  const doSimplify = options?.simplify ?? true;
  const tolerance = options?.tolerance ?? 0.0005;
  const precision = options?.precision ?? 4;

  let result: GeoJSON.Geometry = geometry;

  if (doSimplify && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon' || geometry.type === 'LineString' || geometry.type === 'MultiLineString')) {
    try {
      // Lazy import or static import of turf simplify
      result = simplify(geometry, { tolerance, highQuality: false, mutate: false });
    } catch (e) {
      console.warn('Geometry simplification failed, falling back to unsimplified geometry:', e);
      result = geometry;
    }
  }

  return truncateCoordinates(result as T, precision);
}

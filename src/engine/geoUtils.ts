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

// Store items are immutable (geojson is replaced on edit), so results are memoized by
// feature-collection identity. Callers must treat the returned array as read-only.
const lineCoordsCache = new WeakMap<object, number[][]>();

/**
 * Flattens every LineString / MultiLineString in a feature collection into one
 * coordinate list. Other geometry types and malformed coordinates are skipped.
 */
export function extractLineCoords(fc: { features: GeoJSON.Feature[] }): number[][] {
  const cached = lineCoordsCache.get(fc);
  if (cached) return cached;
  const coords: number[][] = [];
  for (const feature of fc.features) {
    const geom = feature.geometry;
    if (geom?.type === 'LineString' && Array.isArray(geom.coordinates)) {
      coords.push(...geom.coordinates);
    } else if (geom?.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
      for (const line of geom.coordinates) {
        if (Array.isArray(line)) coords.push(...line);
      }
    }
  }
  lineCoordsCache.set(fc, coords);
  return coords;
}

/**
 * Builds a line geometry from coordinates, splitting into a MultiLineString
 * wherever consecutive points jump more than 180° of longitude (antimeridian
 * crossing) so Mapbox doesn't draw a line across the whole map.
 */
export function splitAtAntimeridian(coords: number[][]): GeoJSON.LineString | GeoJSON.MultiLineString {
  const segments: number[][][] = [];
  let current: number[][] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    if (!prev || !curr || typeof prev[0] !== 'number' || typeof curr[0] !== 'number') continue;
    if (Math.abs(curr[0] - prev[0]) > 180) {
      if (current.length >= 2) segments.push(current);
      current = [];
    }
    current.push(curr);
  }
  if (current.length >= 2) segments.push(current);

  if (segments.length === 0) return { type: 'LineString', coordinates: coords };
  return segments.length > 1
    ? { type: 'MultiLineString', coordinates: segments }
    : { type: 'LineString', coordinates: segments[0] };
}

/**
 * Bounding box of a geometry as [[west, south], [east, north]], covering every
 * polygon/line/point in it. Returns null if it has no valid coordinates.
 */
export function geometryBounds(geometry: GeoJSON.Geometry): [[number, number], [number, number]] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const visit = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number' && typeof c[1] === 'number') {
      w = Math.min(w, c[0]); e = Math.max(e, c[0]);
      s = Math.min(s, c[1]); n = Math.max(n, c[1]);
      return;
    }
    for (const child of c) visit(child);
  };
  if (geometry.type === 'GeometryCollection') {
    for (const g of geometry.geometries) visit((g as { coordinates?: unknown }).coordinates);
  } else {
    visit(geometry.coordinates);
  }
  return Number.isFinite(w) ? [[w, s], [e, n]] : null;
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

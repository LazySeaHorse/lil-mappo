import distance from '@turf/distance';
import simplify from '@turf/simplify';
import { point } from '@turf/helpers';
import { bearingDeg, clamp, METERS_PER_DEGREE } from './geoMath';
import type { RoutePath } from './routePath';


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
      // Plain loops: spreading a long recorded track into push() overflows the call stack.
      for (const c of geom.coordinates) coords.push(c);
    } else if (geom?.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
      for (const line of geom.coordinates) {
        if (Array.isArray(line)) for (const c of line) coords.push(c);
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

/** "lng, lat" with 5 decimals (about 1 m), the way coordinates show in search fields. */
export function formatLngLat([lng, lat]: [number, number]): string {
  return `${lng.toFixed(5)}, ${lat.toFixed(5)}`;
}

/**
 * Bounding box of any GeoJSON (geometry, feature or collection) as
 * [[west, south], [east, north]], covering every polygon/line/point in it.
 * Returns null if it has no valid coordinates.
 */
export function geojsonBounds(geojson: GeoJSON.GeoJSON): [[number, number], [number, number]] | null {
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
  const walk = (g: GeoJSON.GeoJSON): void => {
    if (g.type === 'FeatureCollection') g.features.forEach(walk);
    else if (g.type === 'Feature') walk(g.geometry);
    else if (g.type === 'GeometryCollection') g.geometries.forEach(walk);
    else visit(g.coordinates);
  };
  walk(geojson);
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

  let bearing = bearingDeg(start, end);
  if (Number.isNaN(bearing) || !Number.isFinite(bearing)) return 0;
  bearing = ((bearing % 360) + 360) % 360;
  if (bearing === 360 || Object.is(bearing, -0)) return 0;
  return bearing;
}

/**
 * Which way a 3D marker `lengthM` long faces at route progress `u`, as a compass bearing: from the
 * route under its tail to the route under its nose, the road's direction averaged over its length.
 * Bends shorter than the marker cancel out, so a giant one turns smoothly where a small one turns
 * at every vertex.
 *
 * Only the bearing: a marker rides the ground at the route's latitude and longitude and never
 * climbs with a route's altitude (an old flight saved with one), so tilting it by the climb would
 * point its nose into the sky while it stays on the ground.
 */
export function facingAlong(path: RoutePath, u: number, lengthM: number): number {
  const half = path.lengthM > 0 ? lengthM / 2 / path.lengthM : 0;
  let from = path.pointAt(u - half);
  let to = path.pointAt(u + half);
  // A route with no length yet faces along its first segment.
  if (from[0] === to[0] && from[1] === to[1]) [from, to] = path.coords;
  return calculateBearing(from, to);
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
  return clamp(pitch, -90, 90);
}

/**
 * Rounds a single coordinate tuple [lng, lat, alt?] to specified decimal places
 * (default 6, ~0.1 m). Altitude is rounded to 0.1 m.
 */
export function truncateCoordinate(coord: number[], precision = 6): number[] {
  const p = clamp(precision, 0, 15);
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
export function truncateCoordinates<T extends GeoJSON.Geometry>(geometry: T, precision = 6): T {
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

/** Sub-metre cleanup applied to every stored driving / flight route. */
export const ROUTE_SIMPLIFY_TOLERANCE_M = 0.5;

/**
 * Cleanup for imported route files. A 1 Hz recording stores a point every few metres plus GPS
 * jitter while standing still; 1 m is under a pixel at the closest follow-camera zoom and keeps a
 * day-long track well under the cloud-sync size cap.
 */
export const IMPORTED_ROUTE_TOLERANCE_M = 1;

/**
 * Vertical tolerance for imported route files. GPS altitude without a barometer wobbles by metres
 * from second to second; at 1 m that noise kept three quarters of a day's points. Hills are tens of
 * metres, so 5 m keeps their shape and drops the wobble.
 */
export const IMPORTED_ROUTE_VERTICAL_TOLERANCE_M = 5;

/**
 * Converts a distance in metres to degrees for @turf/simplify, which works in degrees.
 * A degree of longitude shrinks with cos(latitude), so away from the equator the
 * resulting tolerance is smaller than requested in metres east-west: conservative
 * (it keeps slightly more points), never lossy.
 */
export function metersToDegrees(meters: number): number {
  return meters / METERS_PER_DEGREE;
}

function hasAltitude(coords: unknown): boolean {
  if (!Array.isArray(coords)) return false;
  if (typeof coords[0] === 'number') return coords.length > 2 && coords[2] !== undefined;
  return coords.some(hasAltitude);
}

/**
 * Douglas-Peucker over one line, measured in metres: every dropped vertex lies within `toleranceM`
 * of the kept line. When every vertex has an altitude it is a third axis, within
 * `verticalToleranceM` (default the same), so a climb along a straight road keeps its profile. Distances are taken on a local plane at each chord's
 * mid-latitude, with longitude unwrapped so an antimeridian crossing is a short step.
 *
 * Iterative (an explicit stack of ranges) because the recursive form can overflow the call stack
 * on a 100k+ point recording. Returns the kept vertices themselves, not copies; a line that loses
 * nothing comes back as the same array.
 */
export function simplifyLine(coords: number[][], toleranceM: number, verticalToleranceM = toleranceM): number[][] {
  const n = coords.length;
  if (n < 3 || !(toleranceM > 0)) return coords;
  const use3d = coords.every((c) => Number.isFinite(c[2])) && verticalToleranceM > 0;
  // Altitude is scaled so a vertical miss of `verticalToleranceM` counts as one of `toleranceM`.
  const kz = toleranceM / verticalToleranceM;

  const lng = new Float64Array(n);
  lng[0] = coords[0][0];
  for (let i = 1; i < n; i++) {
    let d = coords[i][0] - coords[i - 1][0];
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
    lng[i] = lng[i - 1] + d;
  }

  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const tolerance2 = toleranceM * toleranceM;
  const stack = [0, n - 1];
  while (stack.length > 0) {
    const last = stack.pop()!;
    const first = stack.pop()!;
    const a = coords[first];
    const b = coords[last];
    const kx = METERS_PER_DEGREE * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
    const ky = METERS_PER_DEGREE;
    const dx = (lng[last] - lng[first]) * kx;
    const dy = (b[1] - a[1]) * ky;
    const dz = use3d ? (b[2] - a[2]) * kz : 0;
    const len2 = dx * dx + dy * dy + dz * dz;

    let farthest2 = tolerance2;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const p = coords[i];
      const px = (lng[i] - lng[first]) * kx;
      const py = (p[1] - a[1]) * ky;
      const pz = use3d ? (p[2] - a[2]) * kz : 0;
      const t = len2 > 0 ? clamp((px * dx + py * dy + pz * dz) / len2, 0, 1) : 0;
      const ex = px - t * dx, ey = py - t * dy, ez = pz - t * dz;
      const d2 = ex * ex + ey * ey + ez * ez;
      if (d2 > farthest2) {
        farthest2 = d2;
        index = i;
      }
    }
    if (index < 0) continue;
    keep[index] = 1;
    if (index - first > 1) stack.push(first, index);
    if (last - index > 1) stack.push(index, last);
  }

  const out: number[][] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(coords[i]);
  return out.length === n ? coords : out;
}

/**
 * Removes redundant vertices with Douglas-Peucker at a tolerance given in metres, then rounds
 * coordinates (default 6 decimals, ~0.1 m). Surviving vertices keep their original positions, so
 * the shape is preserved while the point count drops.
 *
 * Options: `toleranceM` (default {@link ROUTE_SIMPLIFY_TOLERANCE_M}); `tolerance` is a raw
 * degree override; `verticalToleranceM` bounds altitude on lines (default `toleranceM`);
 * `simplify: false` only rounds.
 *
 * Lines go through {@link simplifyLine}, which keeps an altitude profile and handles any length.
 * Polygons go through @turf/simplify (exact pass, turf `highQuality`, so the tolerance is a true
 * bound); it is 2D-only, so a polygon with altitude is only rounded.
 */
export function optimizeGeometry<T extends GeoJSON.Geometry>(
  geometry: T,
  options?: { simplify?: boolean; toleranceM?: number; tolerance?: number; verticalToleranceM?: number; precision?: number }
): T {
  if (!geometry) return geometry;

  const doSimplify = options?.simplify ?? true;
  const toleranceM = options?.tolerance !== undefined
    ? options.tolerance * METERS_PER_DEGREE
    : options?.toleranceM ?? ROUTE_SIMPLIFY_TOLERANCE_M;
  const verticalToleranceM = options?.verticalToleranceM ?? toleranceM;
  const precision = options?.precision ?? 6;

  let result: GeoJSON.Geometry = geometry;

  if (doSimplify && geometry.type === 'LineString') {
    result = { ...geometry, coordinates: simplifyLine(geometry.coordinates, toleranceM, verticalToleranceM) };
  } else if (doSimplify && geometry.type === 'MultiLineString') {
    result = { ...geometry, coordinates: geometry.coordinates.map((line) => simplifyLine(line, toleranceM, verticalToleranceM)) };
  } else if (
    doSimplify &&
    (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') &&
    !hasAltitude(geometry.coordinates)
  ) {
    const tolerance = metersToDegrees(toleranceM);
    try {
      result = simplify(geometry, { tolerance, highQuality: true, mutate: false });
    } catch (e) {
      console.warn('Geometry simplification failed, falling back to unsimplified geometry:', e);
      result = geometry;
    }
  }

  return truncateCoordinates(result as T, precision);
}

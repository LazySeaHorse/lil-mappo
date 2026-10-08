import { mercToLngLat, lngLatToMerc } from './cameraPose';

/**
 * A route's geometry, built once per coordinate array: mercator vertices (longitude unwrapped
 * so it is continuous across the antimeridian) and progress `u` in 0..1 by geodesic length.
 * Everything that places something "at progress u" goes through here, so the drawn line, the
 * vehicle, the auto-camera and follow-route all agree. Points are interpolated in mercator
 * because that is how Mapbox draws a segment between two GeoJSON vertices.
 *
 * Non-finite vertices are dropped; zero-length segments are kept (they just never get a fraction).
 */
export interface RoutePath {
  /** The finite vertices the path is built on (the input array itself when all are finite). */
  coords: number[][];
  /** Mercator vertices, x unwrapped (may leave 0..1 past the antimeridian). */
  x: Float64Array;
  y: Float64Array;
  /** Progress at each vertex, 0..1 by geodesic length; all 0 for a path with no length. */
  u: Float64Array;
  lengthM: number;
  /** Segment index and fraction through it for progress `u` (clamped to 0..1). Needs two vertices. */
  locate(u: number): [number, number];
  /** [lng, lat(, altitude)] at progress `u`, longitude within [-180, 180]. */
  pointAt(u: number): number[];
  /** The line between progress `u0` and `u1`: interpolated ends, original vertices between. */
  slice(u0: number, u1: number): number[][];
}

const EARTH_RADIUS_M = 6371008.8;
const RAD = Math.PI / 180;

function haversineM(a: number[], b: number[]): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLng = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Segment index (0..n-2) containing `value` in the ascending array `u`, and the fraction through it. */
export function locateSegment(u: ArrayLike<number>, value: number): [number, number] {
  const v = value < 0 ? 0 : value > 1 ? 1 : value;
  let lo = 0;
  let hi = u.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (u[mid] <= v) lo = mid;
    else hi = mid - 1;
  }
  const span = u[lo + 1] - u[lo];
  return [lo, span > 0 ? Math.min(1, Math.max(0, (v - u[lo]) / span)) : 0];
}

function build(input: number[][]): RoutePath {
  const coords = input.every((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]))
    ? input
    : input.filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]));
  const n = coords.length;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const u = new Float64Array(n);
  let prevLng = 0;
  for (let i = 0; i < n; i++) {
    let lng = coords[i][0];
    if (i > 0) {
      lng += 360 * Math.round((prevLng - lng) / 360);
      u[i] = u[i - 1] + haversineM(coords[i - 1], coords[i]);
    }
    prevLng = lng;
    [x[i], y[i]] = lngLatToMerc(lng, coords[i][1]);
  }
  const lengthM = n > 1 ? u[n - 1] : 0;
  if (lengthM > 0) for (let i = 1; i < n; i++) u[i] /= lengthM;

  // The vertex itself at either end of a segment, else the mercator-interpolated point. Longitude
  // is offset from the segment's own start vertex, so a slice stays in its input's frame.
  const interpolate = (i: number, w: number): number[] => {
    if (w <= 0) return coords[i];
    if (w >= 1) return coords[i + 1];
    const a = coords[i];
    const b = coords[i + 1];
    const out = [
      a[0] + w * (b[0] + 360 * Math.round((a[0] - b[0]) / 360) - a[0]),
      mercToLngLat(x[i] + w * (x[i + 1] - x[i]), y[i] + w * (y[i + 1] - y[i]))[1],
    ];
    if (a[2] !== undefined && b[2] !== undefined) out.push(a[2] + w * (b[2] - a[2]));
    return out;
  };

  return {
    coords,
    x,
    y,
    u,
    lengthM,
    locate: (value) => (n > 1 ? locateSegment(u, value) : [0, 0]),
    pointAt(value) {
      if (n === 0) return [0, 0];
      const [i, w] = n > 1 ? locateSegment(u, value) : [0, 0];
      const p = [...interpolate(i, w)];
      if (p[0] > 180 || p[0] < -180) p[0] = ((((p[0] + 180) % 360) + 360) % 360) - 180;
      return p;
    },
    slice(u0, u1) {
      if (n < 2) return coords;
      const a = Math.max(0, Math.min(1, u0));
      const b = Math.max(0, Math.min(1, u1));
      if (a > b) return [];
      if (!(lengthM > 0)) return [coords[0], coords[0]];
      const [i0, w0] = locateSegment(u, a);
      const [i1, w1] = locateSegment(u, b);
      return [interpolate(i0, w0), ...coords.slice(i0 + 1, i1 + (w1 > 0 ? 1 : 0)), interpolate(i1, w1)];
    },
  };
}

const cache = new WeakMap<number[][], RoutePath>();

export function getRoutePath(coords: number[][]): RoutePath {
  let path = cache.get(coords);
  if (!path) {
    path = build(coords);
    cache.set(coords, path);
  }
  return path;
}

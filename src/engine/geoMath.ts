/**
 * Shared spherical-earth and web-mercator math. Everything that measures, projects or
 * wraps coordinates goes through here so the constants and formulas live in one place.
 * Pure, no imports.
 */

/** Mean earth radius in metres (the value turf uses). */
export const EARTH_RADIUS_M = 6371008.8;
/** Equatorial circumference in metres, as Mapbox uses it for scale. */
export const EARTH_CIRCUMFERENCE_M = 40075016.686;
/** Metres per degree of latitude (and of longitude at the equator). */
export const METERS_PER_DEGREE = 111_320;
/** Degrees to radians. */
export const DEG = Math.PI / 180;
/** Latitude where web mercator becomes square; Mapbox clamps at it. */
export const MERCATOR_MAX_LAT = 85.0511287798;
/** Metres per pixel at zoom 0 on the equator, for Mapbox's 512px tiles. */
export const MPP_ZOOM0 = EARTH_CIRCUMFERENCE_M / 512;

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** An angle (or longitude) in degrees, wrapped into [-180, 180). */
export function wrapDegrees(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

// ─── Web mercator ─────────────────────────────────────────────────────────────
// Unit coordinates: x and y run 0..1 over the world, y grows southwards.

export function mercX(lng: number): number {
  return (lng + 180) / 360;
}

/** Latitude is clamped to the mercator limit, so the poles stay finite. */
export function mercY(lat: number): number {
  const latC = clamp(lat, -MERCATOR_MAX_LAT, MERCATOR_MAX_LAT);
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + (latC * DEG) / 2)) / (2 * Math.PI);
}

export function lngFromMercX(x: number): number {
  return x * 360 - 180;
}

export function latFromMercY(y: number): number {
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) / DEG;
}

export function lngLatToMerc(lng: number, lat: number): [number, number] {
  return [mercX(lng), mercY(lat)];
}

export function mercToLngLat(x: number, y: number): [number, number] {
  return [lngFromMercX(x), latFromMercY(y)];
}

/** cos(latitude), kept off zero, for scaling distances at a latitude (clamped to +-85). */
function latitudeScale(lat: number): number {
  return Math.max(1e-6, Math.cos(clamp(lat, -85, 85) * DEG));
}

/** Metres covered by one mercator unit at a latitude. */
export function metersPerMerc(lat: number): number {
  return EARTH_CIRCUMFERENCE_M * latitudeScale(lat);
}

/** Metres per screen pixel at a zoom and latitude, for Mapbox's 512px tiles. */
export function metersPerPixel(zoom: number, lat: number): number {
  return (MPP_ZOOM0 * latitudeScale(lat)) / 2 ** zoom;
}

// ─── Great circle ─────────────────────────────────────────────────────────────

/** Great-circle distance in metres between two [lng, lat] points. */
export function haversineM(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const dφ = (b[1] - a[1]) * DEG;
  const dλ = (b[0] - a[0]) * DEG;
  const s = Math.sin(dφ / 2) ** 2 + Math.cos(a[1] * DEG) * Math.cos(b[1] * DEG) * Math.sin(dλ / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Initial bearing in degrees [0, 360) from `a` to `b` along the great circle. */
export function bearingDeg(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const φ1 = a[1] * DEG;
  const φ2 = b[1] * DEG;
  const dλ = (b[0] - a[0]) * DEG;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (((Math.atan2(y, x) / DEG) % 360) + 360) % 360;
}

/** Point `distM` metres from `from` along `bearing` (degrees), longitude within [-180, 180). */
export function destinationPoint(
  from: [number, number],
  distM: number,
  bearing: number,
): [number, number] {
  const δ = distM / EARTH_RADIUS_M;
  const θ = bearing * DEG;
  const φ1 = from[1] * DEG;
  const λ1 = from[0] * DEG;
  const sinφ2 = clamp(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ), -1, 1);
  const φ2 = Math.asin(sinφ2);
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * sinφ2);
  return [wrapDegrees(λ2 / DEG), φ2 / DEG];
}

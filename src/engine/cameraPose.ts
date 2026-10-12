/**
 * A camera described independently of the viewport: what it looks at, how far
 * away it is, and which way it faces. Every camera the app produces (standard
 * keyframes, free cameras, blends) converts to a pose, so cameras of different
 * kinds can be mixed without visible jumps.
 */

import {
  bearingDeg,
  clamp,
  DEG,
  destinationPoint,
  haversineM,
  lerp,
  lngLatToMerc,
  metersPerMerc,
  metersPerPixel,
  mercToLngLat,
} from './geoMath';

// Re-exported so existing callers keep importing these from here.
export { clamp, destinationPoint, lerp, lngLatToMerc, mercToLngLat, metersPerMerc, wrapDegrees } from './geoMath';

export interface CameraPose {
  target: [number, number];
  /** Distance in metres from the camera to the target. */
  range: number;
  /** Degrees away from looking straight down (0 = top-down). */
  pitch: number;
  bearing: number;
  /**
   * Height in metres of the ground the range and pitch are measured from, when the camera
   * planned it. Otherwise the renderer reads the terrain under the target.
   */
  ground?: number;
}

export interface JumpToLike {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

/** Mapbox's default field of view puts the camera 1.5 viewport heights from its target. */
const CAMERA_TO_CENTER_HEIGHTS = 1.5;
const MAX_POSE_PITCH = 85;
const MIN_RANGE_M = 1;
const MAX_RANGE_M = 4e7;

/** The equivalent of `bearing` (a whole number of turns away) that lies nearest `reference`. */
export function liftBearing(bearing: number, reference: number): number {
  return bearing + 360 * Math.round((reference - bearing) / 360);
}

export function smootherstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

// ─── Conversions ──────────────────────────────────────────────────────────────

export function poseFromJumpTo(j: JumpToLike, viewportHeightPx: number): CameraPose {
  return {
    target: j.center,
    range: clamp(
      CAMERA_TO_CENTER_HEIGHTS * viewportHeightPx * metersPerPixel(j.zoom, j.center[1]),
      MIN_RANGE_M,
      MAX_RANGE_M,
    ),
    pitch: clamp(j.pitch, 0, MAX_POSE_PITCH),
    bearing: j.bearing,
  };
}

export function poseToJumpTo(p: CameraPose, viewportHeightPx: number): JumpToLike {
  const zoom = Math.log2((CAMERA_TO_CENTER_HEIGHTS * viewportHeightPx * metersPerPixel(0, p.target[1])) / p.range);
  return {
    center: p.target,
    zoom: clamp(zoom, 0, 26),
    pitch: clamp(p.pitch, 0, MAX_POSE_PITCH),
    bearing: (((p.bearing % 360) + 360) % 360),
  };
}

/** Camera position (altitude above the target's ground) implied by a pose. */
export function poseToPosition(p: CameraPose): { lngLat: [number, number]; horizontal: number; altitude: number } {
  const pitch = clamp(p.pitch, 0, MAX_POSE_PITCH) * DEG;
  const horizontal = p.range * Math.sin(pitch);
  const altitude = p.range * Math.cos(pitch);
  return { lngLat: destinationPoint(p.target, horizontal, p.bearing + 180), horizontal, altitude };
}

export function poseFromFreeCam(position: [number, number, number], lookAt: [number, number]): CameraPose {
  const horizontal = haversineM([position[0], position[1]], lookAt);
  const altitude = Math.max(0, position[2]);
  return {
    target: lookAt,
    range: clamp(Math.hypot(horizontal, altitude), MIN_RANGE_M, MAX_RANGE_M),
    pitch: clamp(Math.atan2(horizontal, Math.max(1e-6, altitude)) / DEG, 0, MAX_POSE_PITCH),
    bearing: horizontal < 1e-3 ? 0 : bearingDeg([position[0], position[1]], lookAt),
  };
}

export function poseToFreeCam(p: CameraPose): { position: [number, number, number]; lookAt: [number, number] } {
  const { lngLat, altitude } = poseToPosition(p);
  return { position: [lngLat[0], lngLat[1], altitude], lookAt: p.target };
}

// ─── Blending ─────────────────────────────────────────────────────────────────

const RHO = Math.SQRT2;

/**
 * Blends two poses along the "smooth zoom and pan" path of van Wijk & Nuij
 * (the curve behind Mapbox's flyTo): the camera rises while it travels a long
 * way and settles as it arrives, instead of sliding in a straight line.
 * `t` is the raw 0..1 progress; easing is applied inside.
 *
 * Bearings are interpolated as plain numbers, so the turn goes the way the two given values
 * lie apart: callers lift `b.bearing` (see `liftBearing`) to pick the direction, once, from
 * a fixed reference. Choosing the shortest way on every call would flip it whenever a moving
 * endpoint crossed the point opposite the other.
 */
export function blendPoses(a: CameraPose, b: CameraPose, t: number): CameraPose {
  const tt = smootherstep(t);
  if (tt <= 0) return a;
  if (tt >= 1) return b;

  const [ax, ay] = lngLatToMerc(a.target[0], a.target[1]);
  const [bx, by] = lngLatToMerc(b.target[0], b.target[1]);
  const mpm = metersPerMerc((a.target[1] + b.target[1]) / 2);
  const dx = (bx - ax) * mpm;
  const dy = (by - ay) * mpm;
  const u1 = Math.hypot(dx, dy);
  const w0 = a.range;
  const w1 = b.range;

  let frac: number;
  let range: number;
  if (u1 < 1e-3 * Math.max(w0, w1)) {
    // Practically no pan: plain exponential zoom.
    frac = tt;
    range = w0 * (w1 / w0) ** tt;
  } else {
    const rho2 = RHO * RHO;
    const rho4 = rho2 * rho2;
    const b0 = (w1 * w1 - w0 * w0 + rho4 * u1 * u1) / (2 * w0 * rho2 * u1);
    const b1 = (w1 * w1 - w0 * w0 - rho4 * u1 * u1) / (2 * w1 * rho2 * u1);
    // ln(√(b²+1) − b) is −asinh(b); asinh stays finite where the subtraction cancels to log(0).
    const r0 = -Math.asinh(b0);
    const r1 = -Math.asinh(b1);
    const S = (r1 - r0) / RHO;
    const s = tt * S;
    const u = (w0 / rho2) * Math.cosh(r0) * Math.tanh(RHO * s + r0) - (w0 / rho2) * Math.sinh(r0);
    frac = clamp(u / u1, 0, 1);
    range = (w0 * Math.cosh(r0)) / Math.cosh(RHO * s + r0);
  }

  const [lng, lat] = mercToLngLat(ax + (bx - ax) * frac, ay + (by - ay) * frac);
  // Angles follow the eased time rather than the pan fraction so they finish with the move.
  return {
    target: [lng, lat],
    range: clamp(range, MIN_RANGE_M, MAX_RANGE_M),
    pitch: lerp(a.pitch, b.pitch, tt),
    bearing: lerp(a.bearing, b.bearing, tt),
    ground: a.ground !== undefined && b.ground !== undefined ? lerp(a.ground, b.ground, tt) : undefined,
  };
}

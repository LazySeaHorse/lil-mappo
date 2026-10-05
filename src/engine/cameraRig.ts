import distance from '@turf/distance';
import { point } from '@turf/helpers';
import type { AutoCamConfig } from '@/store/types';
import {
  blendPoses,
  clamp,
  destinationPoint,
  lerp,
  liftBearing,
  lngLatToMerc,
  mercToLngLat,
  metersPerMerc,
  poseFromFreeCam,
  poseToFreeCam,
  smootherstep,
  wrapDegrees,
  type CameraPose,
} from './cameraPose';

/**
 * Auto-camera "rig": a smoothed camera path computed once per route and then
 * sampled by progress. Because the whole route is known up front, the smoothing
 * can look ahead as well as behind, so the camera starts turning before a corner
 * instead of being dragged round it. Sampling is a pure function of progress, so
 * scrubbing and frame-by-frame export stay deterministic.
 */

export type AutoCamOutput =
  | { type: 'jumpTo'; center: [number, number]; zoom: number; pitch: number; bearing: number }
  | {
      type: 'freeCam';
      position: [number, number, number];
      lookAt: [number, number];
      /** Facing in degrees, unwrapped so it varies continuously along the route. */
      bearing?: number;
    };

export interface CameraRig {
  total: number;
  step: number;
  /** Smoothed camera anchor, mercator units. */
  ax: Float64Array;
  ay: Float64Array;
  /** Smoothed travel heading in degrees (unwrapped, so it can be interpolated linearly). */
  heading: Float64Array;
  /** 0..1 how sharply the route turns around each sample. */
  turn: Float64Array;
  /**
   * The route's own vertices, mercator units, with their fraction of the route's geodesic
   * length. This is how the renderer places the vehicle, so progress `u` lands on the same
   * spot in the rig as on screen.
   */
  routeX: Float64Array;
  routeY: Float64Array;
  routeU: Float64Array;
  /** Distance along the smoothed path, in metres, at each of those vertices. */
  routeS: Float64Array;
  /** Overview shot framing the whole route. */
  overview: CameraPose;
  /** Mean latitude, for scale conversions. */
  lat: number;
}

const DEG = Math.PI / 180;
const MAX_SAMPLES = 1500;
const MIN_SAMPLES = 200;

// ─── Numeric helpers ──────────────────────────────────────────────────────────

/** Gaussian smoothing with odd reflection at the ends, so straight lines stay straight. */
export function gaussianSmooth(values: ArrayLike<number>, sigma: number): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  if (sigma < 0.3 || n < 3) {
    for (let i = 0; i < n; i++) out[i] = values[i];
    return out;
  }
  const radius = Math.min(Math.ceil(sigma * 3), n - 1);
  const kernel = new Float64Array(radius + 1);
  let sum = 0;
  for (let k = 0; k <= radius; k++) {
    kernel[k] = Math.exp(-(k * k) / (2 * sigma * sigma));
    sum += k === 0 ? kernel[k] : 2 * kernel[k];
  }
  const at = (i: number) => {
    if (i < 0) return 2 * values[0] - values[Math.min(n - 1, -i)];
    if (i > n - 1) return 2 * values[n - 1] - values[Math.max(0, 2 * (n - 1) - i)];
    return values[i];
  };
  for (let i = 0; i < n; i++) {
    let acc = kernel[0] * values[i];
    for (let k = 1; k <= radius; k++) acc += kernel[k] * (at(i - k) + at(i + k));
    out[i] = acc / sum;
  }
  return out;
}

function unwrapDegrees(values: ArrayLike<number>): Float64Array {
  const out = new Float64Array(values.length);
  let prev = 0;
  for (let i = 0; i < values.length; i++) {
    out[i] = i === 0 ? values[0] : prev + wrapDegrees(values[i] - prev);
    prev = out[i];
  }
  return out;
}

function headingsOf(x: Float64Array, y: Float64Array): Float64Array {
  const n = x.length;
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    raw[i] = Math.atan2(x[b] - x[a], -(y[b] - y[a])) / DEG;
  }
  // The first stretch of a straight-line route has no direction to lose; fill any flat gap.
  for (let i = 1; i < n; i++) if (!Number.isFinite(raw[i])) raw[i] = raw[i - 1];
  return unwrapDegrees(raw);
}

/** Centripetal Catmull-Rom through the points, so sparse routes curve instead of kinking. */
function catmullRom(points: [number, number][], perSegment: number): [number, number][] {
  if (perSegment <= 1 || points.length < 3) return points;
  const out: [number, number][] = [];
  const knot = (a: [number, number], b: [number, number]) => Math.max(1e-12, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const p0 = points[i - 1] ?? [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]];
    const p3 = points[i + 2] ?? [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]];
    const t0 = 0;
    const t1 = t0 + knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    for (let k = 0; k < perSegment; k++) {
      const t = t1 + ((t2 - t1) * k) / perSegment;
      const mix = (a: [number, number], b: [number, number], ta: number, tb: number): [number, number] => {
        const w = (t - ta) / (tb - ta);
        return [a[0] * (1 - w) + b[0] * w, a[1] * (1 - w) + b[1] * w];
      };
      const a1 = mix(p0, p1, t0, t1);
      const a2 = mix(p1, p2, t1, t2);
      const a3 = mix(p2, p3, t2, t3);
      const b1 = mix(a1, a2, t0, t2);
      const b2 = mix(a2, a3, t1, t3);
      out.push(mix(b1, b2, t1, t2));
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// ─── Rig construction ─────────────────────────────────────────────────────────

/** How far apart the camera "sees", in metres: the scale all smoothing is relative to. */
function viewScaleM(config: AutoCamConfig, lat: number): number {
  if (config.mode === 'cinematic') return Math.max(20, config.distance);
  const mpp = (40075016.686 / 512) * Math.cos(clamp(lat, -85, 85) * DEG) / 2 ** config.zoom;
  return Math.max(20, mpp * 350);
}

function overviewPose(
  x: Float64Array,
  y: Float64Array,
  lat: number,
): CameraPose {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < x.length; i++) {
    minX = Math.min(minX, x[i]);
    maxX = Math.max(maxX, x[i]);
    minY = Math.min(minY, y[i]);
    maxY = Math.max(maxY, y[i]);
  }
  const mpm = metersPerMerc(lat);
  const diagonal = Math.hypot(maxX - minX, maxY - minY) * mpm;
  const n = x.length;
  const travel = (Math.atan2(x[n - 1] - x[0], -(y[n - 1] - y[0])) / DEG + 360) % 360;
  return {
    target: mercToLngLat((minX + maxX) / 2, (minY + maxY) / 2),
    // At Mapbox's default field of view the view spans about one range across.
    range: Math.max(300, diagonal * 1.25),
    pitch: 50,
    bearing: Number.isFinite(travel) ? travel : 0,
  };
}

export function buildRig(coords: number[][], config: AutoCamConfig): CameraRig | null {
  // Project to mercator, keeping longitude continuous across the antimeridian.
  const pts: [number, number][] = [];
  let prevLng: number | null = null;
  let latSum = 0;
  for (const c of coords) {
    if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    let lng = c[0];
    if (prevLng !== null) lng += 360 * Math.round((prevLng - lng) / 360);
    prevLng = lng;
    latSum += c[1];
    const m = lngLatToMerc(lng, c[1]);
    const last = pts[pts.length - 1];
    if (last && Math.abs(last[0] - m[0]) < 1e-12 && Math.abs(last[1] - m[1]) < 1e-12) continue;
    pts.push(m);
  }
  if (pts.length < 2) return null;
  const lat = latSum / coords.length;
  const mpm = metersPerMerc(lat);

  const perSegment = pts.length < 200 ? 8 : pts.length < 600 ? 3 : 1;
  const dense = catmullRom(pts, perSegment);
  // Every route vertex survives densifying, at a fixed stride.
  const stride = perSegment <= 1 || pts.length < 3 ? 1 : perSegment;
  const cum = new Float64Array(dense.length);
  for (let i = 1; i < dense.length; i++) {
    cum[i] = cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]) * mpm;
  }
  const total = cum[cum.length - 1];
  if (!(total > 0)) return null;

  const routeX = new Float64Array(pts.length);
  const routeY = new Float64Array(pts.length);
  const routeU = new Float64Array(pts.length);
  const routeS = new Float64Array(pts.length);
  let geodesic = 0;
  for (let i = 0; i < pts.length; i++) {
    routeX[i] = pts[i][0];
    routeY[i] = pts[i][1];
    routeS[i] = cum[Math.min(dense.length - 1, i * stride)];
    if (i > 0) geodesic += distance(point(mercToLngLat(pts[i - 1][0], pts[i - 1][1])), point(mercToLngLat(pts[i][0], pts[i][1])), { units: 'kilometers' });
    routeU[i] = geodesic;
  }
  if (geodesic > 0) for (let i = 0; i < pts.length; i++) routeU[i] /= geodesic;

  const L = viewScaleM(config, lat);
  const n = clamp(Math.ceil(total / (L / 20)), MIN_SAMPLES, MAX_SAMPLES);
  const step = total / (n - 1);

  const x = new Float64Array(n);
  const y = new Float64Array(n);
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const s = i * step;
    while (seg < dense.length - 2 && cum[seg + 1] < s) seg++;
    const span = cum[seg + 1] - cum[seg];
    const w = span > 0 ? clamp((s - cum[seg]) / span, 0, 1) : 0;
    x[i] = lerp(dense[seg][0], dense[seg + 1][0], w);
    y[i] = lerp(dense[seg][1], dense[seg + 1][1], w);
  }

  const smoothing = clamp(config.smoothing, 0, 1);
  const sigmaPos = (L * (0.05 + 0.6 * smoothing)) / step;
  const sigmaHeading = (L * (0.3 + 2 * smoothing)) / step;
  const sigmaLocal = (L * 0.1) / step;

  const ax = gaussianSmooth(x, sigmaPos);
  const ay = gaussianSmooth(y, sigmaPos);

  // Long-window heading for calm framing, kept within reach of the local heading so
  // the vehicle never swings out of frame on a tight zig-zag.
  const smoothHeading = headingsOf(gaussianSmooth(x, sigmaHeading), gaussianSmooth(y, sigmaHeading));
  const localHeading = headingsOf(gaussianSmooth(x, sigmaLocal), gaussianSmooth(y, sigmaLocal));
  const maxDeviation = 25 + 45 * smoothing;
  const limited = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const off = clamp(wrapDegrees(smoothHeading[i] - localHeading[i]), -maxDeviation, maxDeviation);
    limited[i] = localHeading[i] + off;
  }
  const heading = gaussianSmooth(unwrapDegrees(limited), (L * 0.15) / step);

  // Turn intensity: heading change over one view-scale window centred on each sample.
  const window = Math.max(1, Math.round(L / step / 2));
  const rawTurn = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = heading[Math.max(0, i - window)];
    const b = heading[Math.min(n - 1, i + window)];
    rawTurn[i] = clamp(Math.abs(b - a) / 90, 0, 1);
  }
  const turn = gaussianSmooth(rawTurn, (L * 0.2) / step);

  return { total, step, ax, ay, heading, turn, routeX, routeY, routeU, routeS, overview: overviewPose(x, y, lat), lat };
}

// ─── Sampling ─────────────────────────────────────────────────────────────────

function sampleArray(arr: Float64Array, index: number): number {
  const i = clamp(index, 0, arr.length - 1);
  const lo = Math.floor(i);
  const hi = Math.min(arr.length - 1, lo + 1);
  return lerp(arr[lo], arr[hi], i - lo);
}

/** Index of the route segment containing `value`, and how far through it (0..1). */
function locate(knots: Float64Array, value: number): [number, number] {
  const last = knots.length - 2;
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (knots[mid] <= value) lo = mid;
    else hi = mid - 1;
  }
  const span = knots[lo + 1] - knots[lo];
  return [lo, span > 0 ? clamp((value - knots[lo]) / span, 0, 1) : 0];
}

/** Where the vehicle is at route progress `u`, mercator units, matching the renderer. */
export function vehicleAt(rig: CameraRig, u: number): [number, number] {
  const [i, w] = locate(rig.routeU, clamp(u, 0, 1));
  return [lerp(rig.routeX[i], rig.routeX[i + 1], w), lerp(rig.routeY[i], rig.routeY[i + 1], w)];
}

/** Distance along the smoothed path, in metres, that corresponds to route progress `u`. */
export function pathDistanceAt(rig: CameraRig, u: number): number {
  const [i, w] = locate(rig.routeU, clamp(u, 0, 1));
  return lerp(rig.routeS[i], rig.routeS[i + 1], w);
}

export interface RigSampleParams {
  /** Route progress 0..1 (after the route's own easing). */
  u: number;
  /** Linear 0..1 progress through the auto-camera block, for time-based motion. */
  p: number;
  /** Rate of route progress relative to constant speed (1 = steady). */
  speed: number;
  /** Highest `speed` the route's easing reaches (1 for a steady pace). */
  peakSpeed?: number;
  /**
   * Wide shots to leave out because the caller already eases this end of the block to a
   * neighbouring keyframe. Both default to on.
   */
  skipShots?: { intro?: boolean; outro?: boolean };
}

/** 0..1 share of the easing's top speed the vehicle is doing right now. */
function paceOf({ speed, peakSpeed = 1 }: RigSampleParams): number {
  return clamp(speed / Math.max(1, peakSpeed), 0, 1);
}

/** -1..1 change of pace around the route's average speed, so it reads the same for any easing. */
function speedDeltaOf(params: RigSampleParams): number {
  const peak = Math.max(1, params.peakSpeed ?? 1);
  if (peak <= 1.001) return 0;
  const average = 1 / peak;
  return clamp((paceOf(params) - average) / (1 - average), -1, 1);
}

interface AnchorState {
  anchor: [number, number];
  ahead: [number, number];
  heading: number;
  turn: number;
}

/**
 * The shot's subject: the vehicle itself, pushed toward the road ahead by `leadM`.
 * The push is measured on the smoothed path, where smoothing that cuts a corner
 * cancels out, so it can never carry the framing away from the vehicle. It scales
 * with `pace`, so a vehicle easing to a stop is framed on its own rather than on
 * empty road in front of it.
 */
function stateAt(rig: CameraRig, s: number, u: number, leadM: number, pace: number): AnchorState {
  const idx = (m: number) => clamp(m, 0, rig.total) / rig.step;
  // Let the lead taper off near the end so the look-at settles onto the finish.
  const remaining = rig.total - s;
  const lead = leadM * pace * smootherstep(remaining / Math.max(1, leadM));
  const i = idx(s);
  const j = idx(s + lead);
  const [vx, vy] = vehicleAt(rig, u);
  return {
    anchor: mercToLngLat(vx, vy),
    ahead: mercToLngLat(
      vx + sampleArray(rig.ax, j) - sampleArray(rig.ax, i),
      vy + sampleArray(rig.ay, j) - sampleArray(rig.ay, i),
    ),
    heading: sampleArray(rig.heading, i),
    turn: sampleArray(rig.turn, i),
  };
}

function resolve<T>(v: T | undefined, fallback: T): T {
  return v === undefined ? fallback : v;
}

/** Share of the block the wide intro / outro shots span at full strength. */
export const INTRO_FRACTION = 0.2;
export const OUTRO_FRACTION = 0.2;

function followPose(rig: CameraRig, config: AutoCamConfig, params: RigSampleParams): CameraPose {
  const { u, p } = params;
  const dynamics = clamp(resolve(config.dynamics, 0.5), 0, 1);
  const orbit = clamp(resolve(config.orbit, 0), 0, 1);
  const s = pathDistanceAt(rig, u);
  const st = stateAt(rig, s, u, config.distance * 0.35, paceOf(params));

  // Reacts to the route: pulls back and rises through turns, and eases out at speed.
  const speedDelta = speedDeltaOf(params);
  const breathe = Math.sin(p * Math.PI * 2 * 3);
  const distance = config.distance * (1 + dynamics * (0.35 * st.turn + 0.25 * speedDelta + 0.04 * breathe));
  const height = config.height * (1 + dynamics * (0.5 * st.turn + 0.3 * speedDelta + 0.05 * breathe));
  const azimuth = orbit * 50 * Math.sin(p * Math.PI * 2 * 0.85 + 0.6);

  const bearing = st.heading + azimuth;
  const position = destinationPoint(st.ahead, distance, bearing + 180);
  const pose = poseFromFreeCam([position[0], position[1], Math.max(1, height)], st.ahead);
  // The vehicle's own heading fixes the facing even when the camera sits directly above it.
  // Left unwrapped so a blend can follow it without flipping direction as it crosses 360.
  pose.bearing = bearing;
  return pose;
}

function withShots(rig: CameraRig, config: AutoCamConfig, params: RigSampleParams, pose: CameraPose): CameraPose {
  const intro = clamp(resolve(config.intro, 0), 0, 1);
  const outro = clamp(resolve(config.outro, 0), 0, 1);
  let out = pose;
  // The overview turns the way that is shortest at the shot's fixed end, not wherever the
  // follow shot happens to face this frame, so the turn can't change direction mid-blend.
  const overviewAt = (edge: 0 | 1): CameraPose => ({
    ...rig.overview,
    bearing: liftBearing(rig.overview.bearing, followPose(rig, config, { ...params, u: edge, p: edge }).bearing),
  });
  if (intro > 0 && !params.skipShots?.intro && params.p < INTRO_FRACTION) {
    // Start wide and settle into the follow shot.
    const t = 1 - smootherstep(params.p / INTRO_FRACTION);
    out = blendPoses(out, overviewAt(0), t * intro);
  }
  if (outro > 0 && !params.skipShots?.outro && params.p > 1 - OUTRO_FRACTION) {
    const t = smootherstep((params.p - (1 - OUTRO_FRACTION)) / OUTRO_FRACTION);
    out = blendPoses(out, overviewAt(1), t * outro);
  }
  return out;
}

export function sampleRig(rig: CameraRig, config: AutoCamConfig, params: RigSampleParams): AutoCamOutput {
  if (config.mode === 'cinematic') {
    const pose = withShots(rig, config, params, followPose(rig, config, params));
    const { position, lookAt } = poseToFreeCam(pose);
    return { type: 'freeCam', position, lookAt, bearing: pose.bearing };
  }

  const dynamics = clamp(resolve(config.dynamics, 0.5), 0, 1);
  const s = pathDistanceAt(rig, params.u);
  // Frame the route ahead: the vehicle sits low in the view and the map turns with the route.
  const st = stateAt(rig, s, params.u, config.lookAhead * 0.5, paceOf(params));
  const speedDelta = speedDeltaOf(params);
  const zoom = config.zoom - dynamics * (0.9 * st.turn + 0.5 * speedDelta);
  return {
    type: 'jumpTo',
    center: st.ahead,
    zoom: clamp(zoom, 0, 22),
    pitch: config.pitch,
    // Unwrapped, like the free camera's, so blends to and from it stay continuous.
    bearing: st.heading,
  };
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const cache = new Map<string, CameraRig | null>();
const CACHE_LIMIT = 8;

function fingerprint(coords: number[][], config: AutoCamConfig): string {
  // FNV-1a over the coordinate values: cheap next to rebuilding, and catches any edit.
  let h = 2166136261;
  for (const c of coords) {
    for (let k = 0; k < 2; k++) {
      const v = Math.round(c[k] * 1e7);
      h = Math.imul(h ^ (v & 0xffff), 16777619);
      h = Math.imul(h ^ ((v >>> 16) & 0xffff), 16777619);
    }
  }
  const scale = config.mode === 'cinematic' ? config.distance : config.zoom;
  return [coords.length, h >>> 0, config.mode, config.smoothing, scale].join(':');
}

export function getRig(coords: number[][], config: AutoCamConfig): CameraRig | null {
  const key = fingerprint(coords, config);
  if (cache.has(key)) {
    const hit = cache.get(key)!;
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const rig = buildRig(coords, config);
  cache.set(key, rig);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  return rig;
}

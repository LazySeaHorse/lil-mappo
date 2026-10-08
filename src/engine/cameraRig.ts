import type { AutoCamConfig, EasingName } from '@/store/types';
import { applyEasing } from './easings';
import { getRoutePath, type RoutePath } from './routePath';
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
 * Auto-camera "rig": the camera's whole path through a block, planned once and then
 * sampled by progress. The plan is laid out in video time, with the block's easing
 * applied, so "smooth" means smooth on screen however fast the route plays.
 *
 * Where the camera looks is the smoothest path (least acceleration) that keeps the
 * vehicle within a safe zone of the frame: the vehicle may wander while the camera
 * glides, instead of every jag in the road shaking the shot. Which way it faces follows
 * a longer-window version of the same path. Sampling is a pure function of progress, so
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
      /** Ground height the position's altitude is measured from, when the rig planned it. */
      ground?: number;
    };

/** Terrain the camera is planned over. */
export interface GroundModel {
  /** Ground height in metres, exaggerated as drawn, or null where it isn't known yet. */
  elevation(lng: number, lat: number): number | null;
  /** Changes whenever the answers might, so plans built on old answers are rebuilt. */
  key: string;
}

/** How long the block lasts and how the route's progress eases through it. */
export interface RigTiming {
  duration: number;
  easing: EasingName;
}

export interface CameraRig {
  /** Where the camera looks at each sample, evenly spaced in time; mercator units. */
  aimX: Float64Array;
  aimY: Float64Array;
  /** Facing in degrees, unwrapped so it can be interpolated linearly. */
  heading: Float64Array;
  /** 0..1 how much the road winds across the shot: 0 straight, about 0.6 round a right angle. */
  winding: Float64Array;
  /** 0..1 share of its top speed the vehicle is doing. */
  pace: Float64Array;
  /** The easing's top rate of progress relative to a steady pace (1 when steady). */
  peakSpeed: number;
  /**
   * Ground height in metres the shot is measured from at each sample, or null with no terrain
   * (or none loaded for the whole shot yet), when it is read from the map frame by frame.
   */
  ground: Float64Array | null;
  /** The route, which places the vehicle exactly as the renderer does. */
  route: RoutePath;
  /** Overview shot framing the whole route. */
  overview: CameraPose;
}

const DEG = Math.PI / 180;
const SAMPLES_PER_SECOND = 60;
const MIN_SAMPLES = 64;
const MAX_SAMPLES = 6000;
/** Road this much longer than the straight line across the shot counts as fully winding. */
const FULL_WINDING = 0.5;

// ─── Smoothing ────────────────────────────────────────────────────────────────

/**
 * Whittaker smoother: for each series y, the z minimising Σ w·(z − y)² + λ·Σ (Δ²z)², i.e. the
 * path closest to the data that accelerates least. One banded (LDLᵀ) solve, shared by all the
 * series. Straight lines at a steady pace pass through unchanged, ends included.
 */
export function whittaker(series: ArrayLike<number>[], weights: ArrayLike<number>, lambda: number): Float64Array[] {
  const n = weights.length;
  if (n < 3 || !(lambda > 0)) return series.map((y) => Float64Array.from(y));

  // The pentadiagonal matrix W + λ·DᵀD as its diagonal and two upper bands.
  const d0 = Float64Array.from(weights);
  const d1 = new Float64Array(n);
  const d2 = new Float64Array(n);
  for (let r = 0; r < n - 2; r++) {
    d0[r] += lambda;
    d0[r + 1] += 4 * lambda;
    d0[r + 2] += lambda;
    d1[r] -= 2 * lambda;
    d1[r + 1] -= 2 * lambda;
    d2[r] += lambda;
  }

  // A = L·D·Lᵀ with L unit lower-triangular: l1[i] = L[i+1][i], l2[i] = L[i+2][i].
  const D = new Float64Array(n);
  const l1 = new Float64Array(n);
  const l2 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = i >= 1 ? D[i - 1] : 0;
    const b = i >= 2 ? D[i - 2] : 0;
    D[i] = d0[i] - (i >= 1 ? l1[i - 1] ** 2 * a : 0) - (i >= 2 ? l2[i - 2] ** 2 * b : 0);
    l1[i] = (d1[i] - (i >= 1 ? l2[i - 1] * l1[i - 1] * a : 0)) / D[i];
    l2[i] = d2[i] / D[i];
  }

  return series.map((y) => {
    const z = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      z[i] = weights[i] * y[i] - (i >= 1 ? l1[i - 1] * z[i - 1] : 0) - (i >= 2 ? l2[i - 2] * z[i - 2] : 0);
    }
    for (let i = 0; i < n; i++) z[i] /= D[i];
    for (let i = n - 1; i >= 0; i--) {
      z[i] -= (i + 1 < n ? l1[i] * z[i + 1] : 0) + (i + 2 < n ? l2[i] * z[i + 2] : 0);
    }
    return z;
  });
}

/** Whittaker λ whose cut-off period is about `seconds` at `rate` samples per second. */
function lambdaFor(seconds: number, rate: number): number {
  return ((seconds * rate) / (2 * Math.PI)) ** 4;
}

/**
 * The smoothest path through (x, y) that stays within `radius` of every point: smooth, then
 * weight the points the path strays too far from more heavily and solve again, until it holds.
 */
export function smoothWithin(
  x: Float64Array,
  y: Float64Array,
  lambda: number,
  radius: number,
): [Float64Array, Float64Array] {
  const n = x.length;
  const w = new Float64Array(n).fill(1);
  let [sx, sy] = whittaker([x, y], w, lambda);
  for (let iteration = 0; iteration < 30; iteration++) {
    let inside = true;
    for (let i = 0; i < n; i++) {
      const stray = Math.hypot(sx[i] - x[i], sy[i] - y[i]) / radius;
      if (stray > 1) {
        inside = false;
        w[i] *= 2 * stray * stray;
      }
    }
    if (inside) break;
    [sx, sy] = whittaker([x, y], w, lambda);
  }
  return [sx, sy];
}

/** The smoothest path near `y` that keeps above `floor`, re-weighting wherever it dips under. */
export function smoothAbove(y: Float64Array, floor: Float64Array, lambda: number): Float64Array {
  const n = y.length;
  const target = Float64Array.from(y, (v, i) => Math.max(v, floor[i]));
  const w = new Float64Array(n).fill(1);
  let [z] = whittaker([target], w, lambda);
  for (let iteration = 0; iteration < 30; iteration++) {
    let above = true;
    for (let i = 0; i < n; i++) {
      if (z[i] < floor[i] - 0.5) {
        above = false;
        w[i] *= 4;
      }
    }
    if (above) break;
    [z] = whittaker([target], w, lambda);
  }
  return z;
}

function unwrapDegrees(values: ArrayLike<number>): Float64Array {
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = i === 0 ? values[0] : out[i - 1] + wrapDegrees(values[i] - out[i - 1]);
  return out;
}

// ─── Rig construction ─────────────────────────────────────────────────────────

/** How much ground the shot spans around its subject, in metres: what framing is relative to. */
function viewScaleM(config: AutoCamConfig, lat: number): number {
  if (config.mode === 'cinematic') return Math.max(20, config.distance);
  const mpp = (40075016.686 / 512) * Math.cos(clamp(lat, -85, 85) * DEG) / 2 ** config.zoom;
  return Math.max(20, mpp * 350);
}

function overviewPose(x: Float64Array, y: Float64Array, lat: number): CameraPose {
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
  const diagonal = Math.hypot(maxX - minX, maxY - minY) * metersPerMerc(lat);
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

export function buildRig(
  coords: number[][],
  config: AutoCamConfig,
  timing: RigTiming,
  ground: GroundModel | null = null,
): CameraRig | null {
  const route = getRoutePath(coords);
  const { x: routeX, y: routeY, lengthM } = route;
  if (routeX.length < 2 || !(lengthM > 0)) return null;
  const lat = route.coords.reduce((sum, c) => sum + c[1], 0) / routeX.length;
  const mpm = metersPerMerc(lat);

  const duration = Number.isFinite(timing.duration) && timing.duration > 0 ? timing.duration : 1;
  const n = clamp(Math.round(duration * SAMPLES_PER_SECOND) + 1, MIN_SAMPLES, MAX_SAMPLES);
  const rate = (n - 1) / duration;

  const u = new Float64Array(n);
  for (let k = 0; k < n; k++) u[k] = applyEasing(timing.easing, k / (n - 1));
  const pace = new Float64Array(n);
  let peak = 0;
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - 1);
    const b = Math.min(n - 1, k + 1);
    pace[k] = (Math.abs(u[b] - u[a]) * (n - 1)) / (b - a);
    peak = Math.max(peak, pace[k]);
  }
  for (let k = 0; k < n; k++) pace[k] = peak > 0 ? pace[k] / peak : 0;

  // The subject: a point on the road ahead of the vehicle, further ahead the faster it goes,
  // so the shot shows where it is heading. Near the finish it runs out of road and settles there.
  const leadM = config.mode === 'cinematic' ? config.distance * 0.35 : config.lookAhead * 0.5;
  const tx = new Float64Array(n);
  const ty = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    [tx[k], ty[k]] = vehicleAt({ route }, u[k] + (leadM * pace[k]) / lengthM);
  }

  const view = viewScaleM(config, lat);
  const smoothing = clamp(config.smoothing, 0, 1);
  const [aimX, aimY] = smoothWithin(
    tx,
    ty,
    lambdaFor(0.4 + 2.6 * smoothing, rate),
    (view * (0.12 + 0.25 * smoothing)) / mpm,
  );

  // Facing: the way the road runs across the shot, from a point half a view behind the vehicle
  // to one half a view ahead, so bends smaller than the shot cancel out. Then averaged over a
  // few seconds of screen time, so it turns at a pace that reads as a pan however fast the
  // route plays. Averaging directions rather than positions keeps it defined as the vehicle
  // slows to a stop. Shorter chords (near the ends, or across a hairpin) count for less.
  //
  // The same chord says how much the road winds across the shot: how much shorter it is than
  // the road it spans. Dynamics pulls back to show a winding stretch, bend or hairpin alike.
  const reach = (view * 0.5) / lengthM;
  const dirX = new Float64Array(n);
  const dirY = new Float64Array(n);
  const rawWinding = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const [bx, by] = vehicleAt({ route }, u[k] - reach);
    const [fx, fy] = vehicleAt({ route }, u[k] + reach);
    dirX[k] = ((fx - bx) * mpm) / view;
    dirY[k] = ((fy - by) * mpm) / view;
    const roadM = (Math.min(1, u[k] + reach) - Math.max(0, u[k] - reach)) * lengthM;
    const chordM = Math.hypot(fx - bx, fy - by) * mpm;
    rawWinding[k] = roadM > 0 ? clamp((1 - chordM / roadM) / FULL_WINDING, 0, 1) : 0;
  }
  const [hx, hy] = whittaker([dirX, dirY], new Float64Array(n).fill(1), lambdaFor(2 + 10 * smoothing, rate));
  const heading = unwrapDegrees(Array.from(hx, (x, k) => Math.atan2(x, -hy[k]) / DEG));
  const [smoothWinding] = whittaker([rawWinding], new Float64Array(n).fill(1), lambdaFor(1.5, rate));
  const winding = smoothWinding.map((w) => clamp(w, 0, 1));

  const rig: CameraRig = {
    aimX,
    aimY,
    heading,
    winding,
    pace,
    peakSpeed: Math.max(1, peak),
    ground: null,
    route,
    overview: overviewPose(routeX, routeY, lat),
  };
  if (ground && config.mode === 'cinematic') rig.ground = planGround(rig, config, ground, lambdaFor(1 + 3 * smoothing, rate));
  return rig;
}

/**
 * The ground the shot is measured from: the terrain under the aim, smoothed so the camera
 * doesn't bob over every ridge and gully, and raised wherever the camera, or its line of sight
 * down to the aim, would otherwise dip into the terrain. Null until the terrain covers the shot.
 */
function planGround(rig: CameraRig, config: AutoCamConfig, model: GroundModel, lambda: number): Float64Array | null {
  const n = rig.aimX.length;
  const under = new Float64Array(n);
  const floor = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const f = framingAt(rig, config, k / (n - 1));
    const g = model.elevation(f.aim[0], f.aim[1]);
    if (g === null) return null;
    under[k] = g;
    floor[k] = -Infinity;
    const back = f.range * Math.sin(f.pitch * DEG);
    const height = f.range * Math.cos(f.pitch * DEG);
    const clearance = 0.1 * f.range;
    // The camera itself, then two points down its line of sight, which runs `height · (1 − along)`
    // above the aim's ground `along` of the way from the camera to the aim.
    for (const along of [0, 1 / 3, 2 / 3]) {
      const [lng, lat] = destinationPoint(f.aim, back * (1 - along), f.bearing + 180);
      const h = model.elevation(lng, lat);
      if (h === null) return null;
      floor[k] = Math.max(floor[k], h + (clearance - height) * (1 - along));
    }
  }
  return smoothAbove(under, floor, lambda);
}

// ─── Sampling ─────────────────────────────────────────────────────────────────

/** Where the vehicle is at route progress `u`, mercator units, matching the renderer. */
export function vehicleAt({ route }: Pick<CameraRig, 'route'>, u: number): [number, number] {
  const [i, w] = route.locate(u);
  return [lerp(route.x[i], route.x[i + 1], w), lerp(route.y[i], route.y[i + 1], w)];
}

export interface RigSampleParams {
  /** Linear 0..1 progress through the auto-camera block. */
  p: number;
  /**
   * Wide shots to leave out because the caller already eases this end of the block to a
   * neighbouring keyframe. Both default to on.
   */
  skipShots?: { intro?: boolean; outro?: boolean };
}

interface RigState {
  aim: [number, number];
  ground?: number;
  heading: number;
  winding: number;
  /** -1..1 change of pace around the route's average speed, so it reads the same for any easing. */
  speedDelta: number;
}

function stateAt(rig: CameraRig, p: number): RigState {
  const n = rig.aimX.length;
  const i = clamp(p, 0, 1) * (n - 1);
  const lo = Math.floor(i);
  const hi = Math.min(n - 1, lo + 1);
  const at = (arr: Float64Array) => lerp(arr[lo], arr[hi], i - lo);
  const average = 1 / rig.peakSpeed;
  return {
    aim: mercToLngLat(at(rig.aimX), at(rig.aimY)),
    ground: rig.ground ? at(rig.ground) : undefined,
    heading: at(rig.heading),
    winding: at(rig.winding),
    speedDelta: rig.peakSpeed <= 1.001 ? 0 : clamp((at(rig.pace) - average) / (1 - average), -1, 1),
  };
}

/** Steepest the follow camera tilts towards the horizon, in degrees from looking straight down. */
const MAX_FOLLOW_PITCH = 85;

/** Share of the block the wide intro / outro shots span at full strength. */
export const INTRO_FRACTION = 0.2;
export const OUTRO_FRACTION = 0.2;

interface Framing {
  aim: [number, number];
  ground?: number;
  /** Straight-line metres from the camera to the aim. */
  range: number;
  /** Degrees from looking straight down. */
  pitch: number;
  bearing: number;
}

/** Where the follow camera sits relative to its subject at progress `p`. */
function framingAt(rig: CameraRig, config: AutoCamConfig, p: number): Framing {
  const dynamics = clamp(config.dynamics ?? 0.5, 0, 1);
  const orbit = clamp(config.orbit ?? 0, 0, 1);
  const st = stateAt(rig, p);

  // Reacts to the route: pulls back and looks down more steeply through bends, and eases out at speed.
  const breathe = Math.sin(p * Math.PI * 2 * 3);
  const range = config.distance * (1 + dynamics * (0.4 * st.winding + 0.27 * st.speedDelta + 0.045 * breathe));
  const pitch = clamp(config.pitch - dynamics * 10 * st.winding, 0, MAX_FOLLOW_PITCH);
  const azimuth = orbit * 50 * Math.sin(p * Math.PI * 2 * 0.85 + 0.6);

  return { aim: st.aim, ground: st.ground, range: Math.max(1, range), pitch, bearing: st.heading + azimuth };
}

function followPose(rig: CameraRig, config: AutoCamConfig, p: number): CameraPose {
  const f = framingAt(rig, config, p);
  // The heading fixes the facing even when the camera sits directly above its subject.
  // Left unwrapped so a blend can follow it without flipping direction as it crosses 360.
  return { target: f.aim, range: f.range, pitch: f.pitch, bearing: f.bearing, ground: f.ground };
}

function withShots(rig: CameraRig, config: AutoCamConfig, params: RigSampleParams, pose: CameraPose): CameraPose {
  const intro = clamp(config.intro ?? 0, 0, 1);
  const outro = clamp(config.outro ?? 0, 0, 1);
  let out = pose;
  // The overview turns the way that is shortest at the shot's fixed end, not wherever the
  // follow shot happens to face this frame, so the turn can't change direction mid-blend.
  const overviewAt = (edge: 0 | 1): CameraPose => {
    const follow = followPose(rig, config, edge);
    return { ...rig.overview, bearing: liftBearing(rig.overview.bearing, follow.bearing), ground: follow.ground };
  };
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
    const pose = withShots(rig, config, params, followPose(rig, config, params.p));
    const { position, lookAt } = poseToFreeCam(pose);
    return { type: 'freeCam', position, lookAt, bearing: pose.bearing, ground: pose.ground };
  }

  // Frame the route ahead: the vehicle sits low in the view and the map turns with the route.
  const dynamics = clamp(config.dynamics ?? 0.5, 0, 1);
  const st = stateAt(rig, params.p);
  const zoom = config.zoom - dynamics * (0.9 * st.winding + 0.5 * st.speedDelta);
  return {
    type: 'jumpTo',
    center: st.aim,
    zoom: clamp(zoom, 0, 22),
    pitch: config.pitch,
    // Unwrapped, like the free camera's, so blends to and from it stay continuous.
    bearing: st.heading,
  };
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const cache = new Map<string, CameraRig | null>();
const CACHE_LIMIT = 8;

function fingerprint(coords: number[][], config: AutoCamConfig, timing: RigTiming, ground: GroundModel | null): string {
  // FNV-1a over the coordinate values: cheap next to rebuilding, and catches any edit.
  let h = 2166136261;
  for (const c of coords) {
    for (let k = 0; k < 2; k++) {
      const v = Math.round(c[k] * 1e7);
      h = Math.imul(h ^ (v & 0xffff), 16777619);
      h = Math.imul(h ^ ((v >>> 16) & 0xffff), 16777619);
    }
  }
  // Only what the plan depends on, so dragging the other sliders doesn't rebuild it.
  const shape = config.mode === 'cinematic' ? [config.distance] : [config.zoom, config.lookAhead];
  // Planning over terrain follows the whole framing, so it depends on the motion sliders too.
  const terrain = ground && config.mode === 'cinematic' ? [ground.key, config.pitch, config.dynamics, config.orbit] : [];
  return [coords.length, h >>> 0, config.mode, config.smoothing, ...shape, timing.duration, timing.easing, ...terrain].join(':');
}

// Skips re-hashing every coordinate when called again with the same arrays/config objects.
interface KeyMemo {
  config: AutoCamConfig;
  timing: RigTiming;
  ground: GroundModel | null;
  key: string;
}
const keyMemo = new WeakMap<number[][], KeyMemo>();

export function getRig(
  coords: number[][],
  config: AutoCamConfig,
  timing: RigTiming,
  ground: GroundModel | null = null,
): CameraRig | null {
  const memo = keyMemo.get(coords);
  let key: string;
  if (
    memo && memo.config === config && memo.ground === ground &&
    memo.timing.duration === timing.duration && memo.timing.easing === timing.easing
  ) {
    key = memo.key;
  } else {
    key = fingerprint(coords, config, timing, ground);
    keyMemo.set(coords, { config, timing, ground, key });
  }
  if (cache.has(key)) {
    const hit = cache.get(key)!;
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const rig = buildRig(coords, config, timing, ground);
  cache.set(key, rig);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  return rig;
}

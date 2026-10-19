import type { CameraKeyframe, ModelAsset, RouteItem } from '@/store/types';
import { applyEasing } from './easings';
import { clamp, lerp, liftBearing, poseFromFreeCam, wrapDegrees } from './cameraPose';
import { getRoutePath } from './routePath';
import { getRig, sampleRig, INTRO_FRACTION, OUTRO_FRACTION, type AutoCamOutput, type GroundModel, type RigSampleParams } from './cameraRig';
import { markerSize } from '@/config/vehicles';

export interface CameraState {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

export type CameraOutput =
  | AutoCamOutput
  /** Two cameras mixed on a smooth zoom-and-pan path; `t` is the raw 0..1 progress. */
  | { type: 'blend'; from: Exclude<CameraOutput, { type: 'blend' }>; to: Exclude<CameraOutput, { type: 'blend' }>; t: number };

// ─── Math helpers ─────────────────────────────────────────────────────────────

function lerpBearing(a: number, b: number, t: number): number {
  const diff = wrapDegrees(b - a);
  return (a + diff * t + 360) % 360;
}

function lerpLngLat(a: [number, number], b: [number, number], t: number): [number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
}

// ─── Block helpers ────────────────────────────────────────────────────────────

// Keyframe arrays are immutable (the store replaces them on every edit), so each one is
// sorted once rather than on every frame. The sorted copy never leaves this module.
const sortedKeyframes = new WeakMap<readonly CameraKeyframe[], readonly CameraKeyframe[]>();

function sortedByTime(keyframes: readonly CameraKeyframe[]): readonly CameraKeyframe[] {
  let sorted = sortedKeyframes.get(keyframes);
  if (!sorted) {
    sorted = [...keyframes].sort((a, b) => a.time - b.time);
    sortedKeyframes.set(keyframes, sorted);
  }
  return sorted;
}

function isTimeInBlock(t: number, routes: RouteItem[]): boolean {
  return routes.some((r) => t >= r.startTime && t <= r.endTime);
}

function findNextKFAfterBlock(
  keyframes: CameraKeyframe[],
  blockEnd: number,
  autoCamRoutes: RouteItem[],
): CameraKeyframe | null {
  return sortedByTime(keyframes).find((kf) => kf.time > blockEnd && !isTimeInBlock(kf.time, autoCamRoutes)) ?? null;
}

function findPrevKFBeforeBlock(
  keyframes: CameraKeyframe[],
  blockStart: number,
  autoCamRoutes: RouteItem[],
): CameraKeyframe | null {
  const candidates = sortedByTime(keyframes).filter((kf) => kf.time < blockStart && !isTimeInBlock(kf.time, autoCamRoutes));
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

/** The keyframe a block leads in from: the last one before it, unless another block sits between. */
function findLeadInKF(
  keyframes: CameraKeyframe[],
  block: RouteItem,
  autoCamRoutes: RouteItem[],
): CameraKeyframe | null {
  const kf = findPrevKFBeforeBlock(keyframes, block.startTime, autoCamRoutes);
  if (!kf) return null;
  const between = autoCamRoutes.some((r) => r !== block && r.startTime > kf.time && r.endTime < block.startTime);
  return between ? null : kf;
}

/** The keyframe a block leads out to: the first one after it, unless another block sits between. */
function findLeadOutKF(
  keyframes: CameraKeyframe[],
  block: RouteItem,
  autoCamRoutes: RouteItem[],
): CameraKeyframe | null {
  const kf = findNextKFAfterBlock(keyframes, block.endTime, autoCamRoutes);
  if (!kf) return null;
  const between = autoCamRoutes.some((r) => r !== block && r.startTime > block.endTime && r.endTime < kf.time);
  return between ? null : kf;
}

// ─── Standard keyframe interpolation ──────────────────────────────────────────

export function clampCameraState(state: CameraState): CameraState {
  let zoom = state.zoom;
  if (!Number.isFinite(zoom)) zoom = 0;
  zoom = clamp(zoom, 0, 26);

  let pitch = state.pitch;
  if (!Number.isFinite(pitch)) pitch = 0;
  pitch = clamp(pitch, 0, 90);

  let bearing = state.bearing;
  if (!Number.isFinite(bearing)) bearing = 0;
  bearing = ((bearing % 360) + 360) % 360;
  if (bearing === 360 || Object.is(bearing, -0)) bearing = 0;

  let lng = state.center[0];
  let lat = state.center[1];
  if (!Number.isFinite(lng)) lng = 0;
  if (!Number.isFinite(lat)) lat = 0;
  lng = clamp(lng, -180, 180);
  lat = clamp(lat, -90, 90);

  return {
    center: [lng, lat],
    zoom,
    pitch,
    bearing,
  };
}

export function interpolateTwoKeyframes(
  kfA: CameraKeyframe,
  kfB: CameraKeyframe,
  t: number,
  getRouteCoords?: (routeId: string) => number[][] | null,
): CameraState {
  const et = applyEasing(kfB.easing, t);

  let center: [number, number];
  if (kfB.followRoute && getRouteCoords) {
    const coords = getRouteCoords(kfB.followRoute);
    if (coords && coords.length >= 2) {
      const [lng, lat] = getRoutePath(coords).pointAt(et);
      center = [lng, lat];
    } else {
      center = lerpLngLat(kfA.camera.center, kfB.camera.center, et);
    }
  } else {
    center = lerpLngLat(kfA.camera.center, kfB.camera.center, et);
  }

  return clampCameraState({
    center,
    zoom: lerp(kfA.camera.zoom, kfB.camera.zoom, et),
    pitch: lerp(kfA.camera.pitch, kfB.camera.pitch, et),
    bearing: lerpBearing(kfA.camera.bearing, kfB.camera.bearing, et),
  });
}

export function getCameraAtTimeFromKeyframes(
  keyframes: CameraKeyframe[],
  time: number,
  getRouteCoords?: (routeId: string) => number[][] | null,
): CameraState | null {
  if (!keyframes || keyframes.length === 0) return null;
  return cameraFromSorted(sortedByTime(keyframes), time, getRouteCoords);
}

/** `getCameraAtTimeFromKeyframes` for keyframes already in time order (and at least one). */
function cameraFromSorted(
  sorted: readonly CameraKeyframe[],
  time: number,
  getRouteCoords?: (routeId: string) => number[][] | null,
): CameraState | null {
  if (sorted.length === 1 || time <= sorted[0].time) {
    const kf = sorted[0];
    return clampCameraState({
      center: kf.camera.center,
      zoom: kf.camera.zoom,
      pitch: kf.camera.pitch,
      bearing: kf.camera.bearing,
    });
  }

  if (time >= sorted[sorted.length - 1].time) {
    const kf = sorted[sorted.length - 1];
    return clampCameraState({
      center: kf.camera.center,
      zoom: kf.camera.zoom,
      pitch: kf.camera.pitch,
      bearing: kf.camera.bearing,
    });
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    if (time >= sorted[i].time && time <= sorted[i + 1].time) {
      const tA = sorted[i].time;
      const tB = sorted[i + 1].time;
      const t = tB > tA ? (time - tA) / (tB - tA) : 0;
      return interpolateTwoKeyframes(sorted[i], sorted[i + 1], t, getRouteCoords);
    }
  }

  const last = sorted[sorted.length - 1];
  return clampCameraState({
    center: last.camera.center,
    zoom: last.camera.zoom,
    pitch: last.camera.pitch,
    bearing: last.camera.bearing,
  });
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/** Seconds over which a block's camera eases in from / out to the neighbouring keyframe. */
function blendSeconds(blockDuration: number): number {
  return Math.min(blockDuration / 2, Math.max(0.6, Math.min(3, blockDuration * 0.15)));
}

/**
 * Seconds over which a block's camera eases from / to a neighbouring keyframe. A non-zero
 * intro / outro sets how long that move takes, scaling the same share of the block the
 * wide shot would span; with none the camera uses a short fixed blend.
 */
function transitionSeconds(blockDuration: number, amount: number, fraction: number): number {
  if (!(amount > 0)) return blendSeconds(blockDuration);
  return Math.min(blockDuration / 2, blockDuration * fraction * Math.min(1, amount));
}

type Plain = Exclude<CameraOutput, { type: 'blend' }>;

function autoCamAt(
  route: RouteItem,
  coords: number[][],
  progress: number,
  skipShots: RigSampleParams['skipShots'],
  ground: GroundModel | null,
  models: Record<string, ModelAsset> | undefined,
): Plain | null {
  const config = route.autoCam!;
  const timing = { duration: route.endTime - route.startTime, easing: route.easing ?? 'easeInOutSine' };
  const rig = getRig(coords, config, timing, ground, markerSize(route.calculation?.vehicle, models)?.reachM ?? 0);
  if (!rig) return null;
  return sampleRig(rig, config, { p: clamp(progress, 0, 1), skipShots });
}

/**
 * With a neighbouring keyframe the intro / outro is the move to or from it, in place of
 * the wide shot, so the two never stack into an outward swoop and a second move.
 */
function blockSkipShots(
  route: RouteItem,
  prevKF: CameraKeyframe | null,
  nextKF: CameraKeyframe | null,
): RigSampleParams['skipShots'] {
  const config = route.autoCam!;
  return { intro: (config.intro ?? 0) > 0 && prevKF !== null, outro: (config.outro ?? 0) > 0 && nextKF !== null };
}

/** When the move in from the previous keyframe finishes, a stretch into the block. */
function entryEnd(route: RouteItem): number {
  const duration = route.endTime - route.startTime;
  return route.startTime + transitionSeconds(duration, route.autoCam!.intro ?? 0, INTRO_FRACTION);
}

/** Which way a shot faces, in unwrapped degrees. */
function shotBearing(shot: Plain): number {
  if (shot.type === 'jumpTo') return shot.bearing;
  return shot.bearing ?? poseFromFreeCam(shot.position, shot.lookAt).bearing;
}

/**
 * The keyframe's camera with its bearing turned a whole number of times to sit nearest
 * `reference`. A blend interpolates bearings as plain numbers, so this one choice, made
 * against a fixed shot rather than the moving one, decides which way it turns.
 */
function keyframeCamera(kf: CameraKeyframe, reference: Plain): Plain {
  return { type: 'jumpTo', ...kf.camera, bearing: liftBearing(kf.camera.bearing, shotBearing(reference)) };
}

/**
 * The one move from the previous keyframe into a block, spanning the gap before it.
 * `start` is the block's opening shot, which fixes the way the bearing turns.
 */
function leadInBlend(prevKF: CameraKeyframe, to: Plain, start: Plain, route: RouteItem, time: number): CameraOutput {
  const from = keyframeCamera(prevKF, start);
  const t = (time - prevKF.time) / (entryEnd(route) - prevKF.time);
  return { type: 'blend', from, to, t: clamp(t, 0, 1) };
}

/** When the move out to the next keyframe starts, a stretch before the block ends. */
function exitStart(route: RouteItem): number {
  const duration = route.endTime - route.startTime;
  return route.endTime - transitionSeconds(duration, route.autoCam!.outro ?? 0, OUTRO_FRACTION);
}

/** Progress through a block (0..1) at which the move out to the next keyframe starts. */
function exitProgress(route: RouteItem): number {
  const duration = route.endTime - route.startTime;
  return duration > 0 ? (exitStart(route) - route.startTime) / duration : 1;
}

/**
 * The one move from a block out to the next keyframe, spanning the gap after it.
 * `exit` is the shot the move leaves from, which fixes the way the bearing turns.
 */
function leadOutBlend(from: Plain, exit: Plain, nextKF: CameraKeyframe, route: RouteItem, time: number): CameraOutput {
  const to = keyframeCamera(nextKF, exit);
  const start = exitStart(route);
  const t = (time - start) / (nextKF.time - start);
  return { type: 'blend', from, to, t: clamp(t, 0, 1) };
}

export function getCameraAtTime(
  keyframes: CameraKeyframe[],
  time: number,
  getRouteCoords: (routeId: string) => number[][] | null,
  routes?: RouteItem[],
  /** Terrain to plan auto-camera heights over; without it they follow the map's terrain. */
  ground: GroundModel | null = null,
  /** The project's imported models, to size a custom route marker. */
  models?: Record<string, ModelAsset>,
): CameraOutput | null {
  const autoCamRoutes = routes?.filter((r) => r.autoCam?.enabled) ?? [];

  // Check if current time falls inside an auto-cam block
  const activeRoute = autoCamRoutes.find((r) => time >= r.startTime && time <= r.endTime);

  if (activeRoute?.autoCam) {
    const coords = getRouteCoords(activeRoute.id);

    if (coords && coords.length >= 2) {
      const blockStart = activeRoute.startTime;
      const blockEnd = activeRoute.endTime;
      const blockDuration = blockEnd - blockStart;
      const progress = blockDuration > 0 ? (time - blockStart) / blockDuration : 0;
      const prevKF = findLeadInKF(keyframes, activeRoute, autoCamRoutes);
      const nextKF = findLeadOutKF(keyframes, activeRoute, autoCamRoutes);
      const autoCam = autoCamAt(activeRoute, coords, progress, blockSkipShots(activeRoute, prevKF, nextKF), ground, models);

      if (autoCam) {
        // Exit blend: from the last stretch of the block through to the next manual KF
        if (nextKF && time > exitStart(activeRoute)) {
          const exit = autoCamAt(activeRoute, coords, exitProgress(activeRoute), blockSkipShots(activeRoute, prevKF, nextKF), ground, models);
          return leadOutBlend(autoCam, exit ?? autoCam, nextKF, activeRoute, time);
        }

        // Entry blend: from the previous manual KF through the first stretch of the block
        if (prevKF && time < entryEnd(activeRoute)) {
          const start = autoCamAt(activeRoute, coords, 0, blockSkipShots(activeRoute, prevKF, nextKF), ground, models);
          return leadInBlend(prevKF, autoCam, start ?? autoCam, activeRoute, time);
        }

        return autoCam;
      }
    }
  }

  // Before a block, move toward it from the keyframe it leads in from, so the camera is
  // already travelling when the block starts instead of holding still until then.
  const upcoming = autoCamRoutes
    .filter((r) => r.startTime > time && getRouteCoords(r.id))
    .sort((a, b) => a.startTime - b.startTime)[0];
  if (upcoming) {
    const prevKF = findLeadInKF(keyframes, upcoming, autoCamRoutes);
    if (prevKF && prevKF.time <= time) {
      const nextKF = findNextKFAfterBlock(keyframes, upcoming.endTime, autoCamRoutes);
      const start = autoCamAt(upcoming, getRouteCoords(upcoming.id)!, 0, blockSkipShots(upcoming, prevKF, nextKF), ground, models);
      if (start) return leadInBlend(prevKF, start, start, upcoming, time);
    }
  }

  // After a block, keep moving toward the keyframe it leads out to rather than arriving
  // there as the block ends and holding still.
  const passed = autoCamRoutes
    .filter((r) => r.endTime < time && getRouteCoords(r.id))
    .sort((a, b) => b.endTime - a.endTime)[0];
  if (passed) {
    const nextKF = findLeadOutKF(keyframes, passed, autoCamRoutes);
    if (nextKF && time < nextKF.time) {
      const prevKF = findLeadInKF(keyframes, passed, autoCamRoutes);
      const end = autoCamAt(passed, getRouteCoords(passed.id)!, 1, blockSkipShots(passed, prevKF, nextKF), ground, models);
      const exit = autoCamAt(passed, getRouteCoords(passed.id)!, exitProgress(passed), blockSkipShots(passed, prevKF, nextKF), ground, models);
      if (end) return leadOutBlend(end, exit ?? end, nextKF, passed, time);
    }
  }

  // Standard keyframe interpolation — skip KFs inside any auto-cam block
  // Filtered from the sorted keyframes, so it stays in time order.
  const activeKeyframes = sortedByTime(keyframes).filter((kf) => !isTimeInBlock(kf.time, autoCamRoutes));

  // After a block with no keyframe following it, hold the camera where the block ended
  // rather than snapping back to a keyframe from before it.
  if (passed) {
    const lastKF = activeKeyframes.reduce<CameraKeyframe | null>(
      (best, kf) => (kf.time <= time && (!best || kf.time > best.time) ? kf : best),
      null,
    );
    const nextKF = activeKeyframes.find((kf) => kf.time > time);
    if (!nextKF && (!lastKF || lastKF.time < passed.endTime)) {
      const held = autoCamAt(passed, getRouteCoords(passed.id)!, 1, undefined, ground, models);
      if (held) return held;
    }
  }

  const result = activeKeyframes.length > 0 ? cameraFromSorted(activeKeyframes, time, getRouteCoords) : null;
  if (!result) return null;
  return { type: 'jumpTo', ...result };
}

import type { CameraKeyframe, EasingName, RouteItem } from '@/store/types';
import { applyEasing } from './easings';
import along from '@turf/along';
import length from '@turf/length';
import { lineString } from '@turf/helpers';
import { getRig, sampleRig, type AutoCamOutput } from './cameraRig';

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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpBearing(a: number, b: number, t: number): number {
  const diff = ((b - a + 540) % 360) - 180;
  return (a + diff * t + 360) % 360;
}

function lerpLngLat(a: [number, number], b: [number, number], t: number): [number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
}

// ─── Block helpers ────────────────────────────────────────────────────────────

function isTimeInBlock(t: number, routes: RouteItem[]): boolean {
  return routes.some((r) => t >= r.startTime && t <= r.endTime);
}

function findNextKFAfterBlock(
  keyframes: CameraKeyframe[],
  blockEnd: number,
  autoCamRoutes: RouteItem[],
): CameraKeyframe | null {
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  return sorted.find((kf) => kf.time > blockEnd && !isTimeInBlock(kf.time, autoCamRoutes)) ?? null;
}

function findPrevKFBeforeBlock(
  keyframes: CameraKeyframe[],
  blockStart: number,
  autoCamRoutes: RouteItem[],
): CameraKeyframe | null {
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  const candidates = sorted.filter((kf) => kf.time < blockStart && !isTimeInBlock(kf.time, autoCamRoutes));
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

// ─── Standard keyframe interpolation ──────────────────────────────────────────

export function clampCameraState(state: CameraState): CameraState {
  let zoom = state.zoom;
  if (!Number.isFinite(zoom)) zoom = 0;
  zoom = Math.max(0, Math.min(26, zoom));

  let pitch = state.pitch;
  if (!Number.isFinite(pitch)) pitch = 0;
  pitch = Math.max(0, Math.min(90, pitch));

  let bearing = state.bearing;
  if (!Number.isFinite(bearing)) bearing = 0;
  bearing = ((bearing % 360) + 360) % 360;
  if (bearing === 360 || Object.is(bearing, -0)) bearing = 0;

  let lng = state.center[0];
  let lat = state.center[1];
  if (!Number.isFinite(lng)) lng = 0;
  if (!Number.isFinite(lat)) lat = 0;
  lng = Math.max(-180, Math.min(180, lng));
  lat = Math.max(-90, Math.min(90, lat));

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
      const line = lineString(coords);
      const totalLen = length(line, { units: 'kilometers' });
      const pt = along(line, Math.max(0, Math.min(1, et)) * totalLen, { units: 'kilometers' });
      center = pt.geometry.coordinates as [number, number];
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

  const sorted = [...keyframes].sort((a, b) => a.time - b.time);

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

/** Rate of route progress relative to a steady pace, from the block's easing. */
function progressSpeed(easing: EasingName, p: number): number {
  const d = 0.01;
  const a = Math.max(0, p - d);
  const b = Math.min(1, p + d);
  if (b <= a) return 1;
  return (applyEasing(easing, b) - applyEasing(easing, a)) / (b - a);
}

/** Seconds over which a block's camera eases in from / out to the neighbouring keyframe. */
function blendSeconds(blockDuration: number): number {
  return Math.min(blockDuration / 2, Math.max(0.6, Math.min(3, blockDuration * 0.15)));
}

type Plain = Exclude<CameraOutput, { type: 'blend' }>;

function autoCamAt(route: RouteItem, coords: number[][], progress: number): Plain | null {
  const config = route.autoCam!;
  const rig = getRig(coords, config);
  if (!rig) return null;
  const p = Math.max(0, Math.min(1, progress));
  const easing = route.easing ?? 'easeInOutSine';
  return sampleRig(rig, config, { u: applyEasing(easing, p), p, speed: progressSpeed(easing, p) });
}

export function getCameraAtTime(
  keyframes: CameraKeyframe[],
  time: number,
  getRouteCoords: (routeId: string) => number[][] | null,
  routes?: RouteItem[],
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
      const BLEND = blendSeconds(blockDuration);
      const progress = blockDuration > 0 ? (time - blockStart) / blockDuration : 0;
      const autoCam = autoCamAt(activeRoute, coords, progress);

      if (autoCam) {
        // Exit blend: last BLEND seconds of block → ease toward next manual KF
        if (BLEND > 0 && time > blockEnd - BLEND) {
          const nextKF = findNextKFAfterBlock(keyframes, blockEnd, autoCamRoutes);
          if (nextKF) {
            const nextCam: Plain = { type: 'jumpTo', ...nextKF.camera };
            return { type: 'blend', from: autoCam, to: nextCam, t: (time - (blockEnd - BLEND)) / BLEND };
          }
        }

        // Entry blend: first BLEND seconds of block → ease from previous manual KF
        if (BLEND > 0 && time < blockStart + BLEND) {
          const prevKF = findPrevKFBeforeBlock(keyframes, blockStart, autoCamRoutes);
          if (prevKF) {
            const prevCam: Plain = { type: 'jumpTo', ...prevKF.camera };
            return { type: 'blend', from: prevCam, to: autoCam, t: (time - blockStart) / BLEND };
          }
        }

        return autoCam;
      }
    }
  }

  // Standard keyframe interpolation — skip KFs inside any auto-cam block
  const activeKeyframes = keyframes.filter((kf) => !isTimeInBlock(kf.time, autoCamRoutes));

  // After a block with no keyframe following it, hold the camera where the block ended
  // rather than snapping back to a keyframe from before it.
  const finished = autoCamRoutes
    .filter((r) => r.endTime < time && getRouteCoords(r.id))
    .sort((a, b) => b.endTime - a.endTime)[0];
  if (finished) {
    const lastKF = activeKeyframes.reduce<CameraKeyframe | null>(
      (best, kf) => (kf.time <= time && (!best || kf.time > best.time) ? kf : best),
      null,
    );
    const nextKF = activeKeyframes.find((kf) => kf.time > time);
    if (!nextKF && (!lastKF || lastKF.time < finished.endTime)) {
      const held = autoCamAt(finished, getRouteCoords(finished.id)!, 1);
      if (held) return held;
    }
  }

  const result = getCameraAtTimeFromKeyframes(activeKeyframes, time, getRouteCoords);
  if (!result) return null;
  return { type: 'jumpTo', ...result };
}

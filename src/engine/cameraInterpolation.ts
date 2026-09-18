import type { CameraKeyframe, RouteItem } from '@/store/types';
import { applyEasing } from './easings';
import along from '@turf/along';
import length from '@turf/length';
import { lineString } from '@turf/helpers';
import { calculateBearing } from './geoUtils';

export interface CameraState {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

export type CameraOutput =
  | { type: 'jumpTo'; center: [number, number]; zoom: number; pitch: number; bearing: number }
  | { type: 'freeCam'; position: [number, number, number]; lookAt: [number, number] };

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

// Vincenty destination formula: given start (lng, lat), distance in km, bearing in degrees
function destinationPoint(lng: number, lat: number, distKm: number, bearingDeg: number): [number, number] {
  const R = 6371.0088;
  const δ = distKm / R;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;
  const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const clampedSinφ2 = Math.max(-1, Math.min(1, sinφ2));
  const φ2 = Math.asin(clampedSinφ2);
  const y = Math.sin(θ) * Math.sin(δ) * Math.cos(φ1);
  const x = Math.cos(δ) - Math.sin(φ1) * sinφ2;
  const λ2 = λ1 + Math.atan2(y, x);
  return [((λ2 * 180) / Math.PI + 540) % 360 - 180, (φ2 * 180) / Math.PI];
}

// Haversine distance in meters
function haversineDistM(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const φ1 = (a[1] * Math.PI) / 180;
  const φ2 = (b[1] * Math.PI) / 180;
  const Δφ = ((b[1] - a[1]) * Math.PI) / 180;
  const Δλ = ((b[0] - a[0]) * Math.PI) / 180;
  const s = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// ─── Auto-cam computation ─────────────────────────────────────────────────────

function computeCinematicCamera(
  coords: number[][],
  progress: number,
  config: NonNullable<RouteItem['autoCam']>,
): CameraOutput {
  const line = lineString(coords);
  const totalLen = length(line, { units: 'kilometers' });
  const dist = progress * totalLen;

  // Current position on route
  const currentPt = along(line, dist, { units: 'kilometers' });
  const [currentLng, currentLat] = currentPt.geometry.coordinates as [number, number];

  // Look-at: slightly ahead of current position for natural framing
  const lookAheadKm = Math.min(dist + (config.distance / 1000) * 0.3, totalLen);
  const lookAtPt = along(line, lookAheadKm, { units: 'kilometers' });
  const lookAt = lookAtPt.geometry.coordinates as [number, number];

  // Smoothed travel bearing: sample a window around current position
  const smoothWindowKm = config.smoothing * 0.5;
  const fromDist = Math.max(0, dist - smoothWindowKm);
  const toDist = Math.min(totalLen, dist + smoothWindowKm * 0.5);
  const fromPt = along(line, fromDist, { units: 'kilometers' });
  const toPt = along(line, toDist, { units: 'kilometers' });
  const travelBearing = calculateBearing(
    fromPt.geometry.coordinates as number[],
    toPt.geometry.coordinates as number[],
  );

  // Camera position: behind and above current point
  const antiBearing = (travelBearing + 180) % 360;
  const camLngLat = destinationPoint(currentLng, currentLat, config.distance / 1000, antiBearing);

  return {
    type: 'freeCam',
    position: [camLngLat[0], camLngLat[1], config.height],
    lookAt,
  };
}

function computeNavigationCamera(
  coords: number[][],
  progress: number,
  config: NonNullable<RouteItem['autoCam']>,
): CameraOutput {
  const line = lineString(coords);
  const totalLen = length(line, { units: 'kilometers' });
  const dist = progress * totalLen;

  const currentPt = along(line, dist, { units: 'kilometers' });
  const [currentLng, currentLat] = currentPt.geometry.coordinates as [number, number];

  // Smoothed bearing via window
  const smoothWindowKm = config.smoothing * 0.5;
  const fromDist = Math.max(0, dist - smoothWindowKm);
  const toDist = Math.min(totalLen, dist + Math.max(config.lookAhead / 1000, smoothWindowKm * 0.3));
  const fromPt = along(line, fromDist, { units: 'kilometers' });
  const toPt = along(line, toDist, { units: 'kilometers' });
  const bearing = calculateBearing(
    fromPt.geometry.coordinates as number[],
    toPt.geometry.coordinates as number[],
  );

  return {
    type: 'jumpTo',
    center: [currentLng, currentLat],
    zoom: config.zoom,
    pitch: config.pitch,
    bearing: (bearing + 360) % 360,
  };
}

// Convert a freeCam position to an approximate standard camera state (for boundary blending)
function freeCamToJumpTo(
  position: [number, number, number],
  lookAt: [number, number],
): Extract<CameraOutput, { type: 'jumpTo' }> {
  const bearing = calculateBearing([position[0], position[1]], [lookAt[0], lookAt[1]]);
  const hDistM = haversineDistM([position[0], position[1]], lookAt);
  const alt = Math.max(1, position[2]);
  const pitch = Math.max(0, Math.min(85, (Math.atan2(hDistM, alt) * 180) / Math.PI));
  const latCos = Math.max(1e-6, Math.cos((lookAt[1] * Math.PI) / 180));
  const metersPerPixel = Math.max(0.1, hDistM / 400);
  const zoomRatio = (156543.03 * latCos) / metersPerPixel;
  const zoom = Math.max(0, Math.min(22, zoomRatio > 0 ? Math.log2(zoomRatio) : 0));
  return {
    type: 'jumpTo',
    center: [
      Math.max(-180, Math.min(180, lookAt[0])),
      Math.max(-90, Math.min(90, lookAt[1])),
    ],
    zoom,
    pitch,
    bearing: ((bearing % 360) + 360) % 360,
  };
}

type JumpToOutput = Extract<CameraOutput, { type: 'jumpTo' }>;

function lerpJumpTo(a: JumpToOutput, b: JumpToOutput, t: number): JumpToOutput {
  const et = applyEasing('easeInOutSine', t);
  return {
    type: 'jumpTo',
    center: lerpLngLat(a.center, b.center, et),
    zoom: lerp(a.zoom, b.zoom, et),
    pitch: lerp(a.pitch, b.pitch, et),
    bearing: lerpBearing(a.bearing, b.bearing, et),
  };
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

function interpolateTwoKeyframes(
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

export function interpolateCamera(
  keyframes: CameraKeyframe[],
  time: number,
  getRouteCoords?: (routeId: string) => number[][] | null,
): CameraState;
export function interpolateCamera(
  kfA: CameraKeyframe,
  kfB: CameraKeyframe,
  t: number,
  getRouteCoords?: (routeId: string) => number[][] | null,
): CameraState;
export function interpolateCamera(
  first: CameraKeyframe | CameraKeyframe[],
  second: CameraKeyframe | number,
  third?: number | ((routeId: string) => number[][] | null),
  fourth?: (routeId: string) => number[][] | null,
): CameraState {
  if (Array.isArray(first)) {
    const keyframes = first;
    const time = second as number;
    const getRouteCoords = typeof third === 'function' ? third : undefined;
    const result = getCameraAtTimeFromKeyframes(keyframes, time, getRouteCoords);
    return result ?? { center: [0, 0], zoom: 3, pitch: 0, bearing: 0 };
  } else {
    const kfA = first;
    const kfB = second as CameraKeyframe;
    const t = third as number;
    const getRouteCoords = fourth;
    return interpolateTwoKeyframes(kfA, kfB, t, getRouteCoords);
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

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
    const config = activeRoute.autoCam;
    const coords = getRouteCoords(activeRoute.id);

    if (coords && coords.length >= 2) {
      const blockStart = activeRoute.startTime;
      const blockEnd = activeRoute.endTime;
      const blockDuration = blockEnd - blockStart;
      const BLEND = Math.min(0.5, blockDuration / 2);
      const progress = blockDuration > 0 ? (time - blockStart) / blockDuration : 0;
      const easedProgress = applyEasing(activeRoute.easing ?? 'easeInOutSine', Math.max(0, Math.min(1, progress)));

      const fullAutoCam =
        config.mode === 'cinematic'
          ? computeCinematicCamera(coords, easedProgress, config)
          : computeNavigationCamera(coords, easedProgress, config);

      // Exit blend: last BLEND seconds of block → ease toward next manual KF
      if (BLEND > 0 && time > blockEnd - BLEND) {
        const blendT = (time - (blockEnd - BLEND)) / BLEND;
        const nextKF = findNextKFAfterBlock(keyframes, blockEnd, autoCamRoutes);
        if (nextKF) {
          const autoCamStd: JumpToOutput =
            fullAutoCam.type === 'freeCam'
              ? freeCamToJumpTo(fullAutoCam.position, fullAutoCam.lookAt)
              : fullAutoCam;
          const nextStd: JumpToOutput = { type: 'jumpTo', ...nextKF.camera };
          return lerpJumpTo(autoCamStd, nextStd, blendT);
        }
      }

      // Entry blend: first BLEND seconds of block → ease from previous manual KF
      if (BLEND > 0 && time < blockStart + BLEND) {
        const blendT = (time - blockStart) / BLEND;
        const prevKF = findPrevKFBeforeBlock(keyframes, blockStart, autoCamRoutes);
        if (prevKF) {
          const autoCamStd: JumpToOutput =
            fullAutoCam.type === 'freeCam'
              ? freeCamToJumpTo(fullAutoCam.position, fullAutoCam.lookAt)
              : fullAutoCam;
          const prevStd: JumpToOutput = { type: 'jumpTo', ...prevKF.camera };
          return lerpJumpTo(prevStd, autoCamStd, blendT);
        }
      }

      return fullAutoCam;
    }
  }

  // Standard keyframe interpolation — skip KFs inside any auto-cam block
  const activeKeyframes = keyframes.filter((kf) => !isTimeInBlock(kf.time, autoCamRoutes));
  const result = getCameraAtTimeFromKeyframes(activeKeyframes, time, getRouteCoords);
  if (!result) return null;
  return { type: 'jumpTo', ...result };
}

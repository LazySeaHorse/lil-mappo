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
  const φ2 = Math.asin(sinφ2);
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
  const pitch = Math.min(85, (Math.atan2(hDistM, position[2]) * 180) / Math.PI);
  const latCos = Math.cos((lookAt[1] * Math.PI) / 180);
  const metersPerPixel = Math.max(0.1, hDistM / 400);
  const zoom = Math.log2((156543.03 * latCos) / metersPerPixel);
  return {
    type: 'jumpTo',
    center: lookAt,
    zoom: Math.max(0, Math.min(22, zoom)),
    pitch,
    bearing: (bearing + 360) % 360,
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

// ─── Standard keyframe interpolation (unchanged logic) ───────────────────────

function interpolateCamera(
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
      const pt = along(line, et * totalLen, { units: 'kilometers' });
      center = pt.geometry.coordinates as [number, number];
    } else {
      center = lerpLngLat(kfA.camera.center, kfB.camera.center, et);
    }
  } else {
    center = lerpLngLat(kfA.camera.center, kfB.camera.center, et);
  }

  return {
    center,
    zoom: lerp(kfA.camera.zoom, kfB.camera.zoom, et),
    pitch: lerp(kfA.camera.pitch, kfB.camera.pitch, et),
    bearing: lerpBearing(kfA.camera.bearing, kfB.camera.bearing, et),
  };
}

function getCameraAtTimeFromKeyframes(
  keyframes: CameraKeyframe[],
  time: number,
  getRouteCoords?: (routeId: string) => number[][] | null,
): CameraState | null {
  if (keyframes.length === 0) return null;
  if (keyframes.length === 1) {
    const kf = keyframes[0];
    return { center: kf.camera.center, zoom: kf.camera.zoom, pitch: kf.camera.pitch, bearing: kf.camera.bearing };
  }
  if (time <= keyframes[0].time) {
    const kf = keyframes[0];
    return { center: kf.camera.center, zoom: kf.camera.zoom, pitch: kf.camera.pitch, bearing: kf.camera.bearing };
  }
  if (time >= keyframes[keyframes.length - 1].time) {
    const kf = keyframes[keyframes.length - 1];
    return { center: kf.camera.center, zoom: kf.camera.zoom, pitch: kf.camera.pitch, bearing: kf.camera.bearing };
  }
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
      const tA = keyframes[i].time;
      const tB = keyframes[i + 1].time;
      const t = tB > tA ? (time - tA) / (tB - tA) : 0;
      return interpolateCamera(keyframes[i], keyframes[i + 1], t, getRouteCoords);
    }
  }
  return null;
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
      const easedProgress = applyEasing(config.easing, Math.max(0, Math.min(1, progress)));

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

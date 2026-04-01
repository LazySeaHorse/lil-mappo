import type { CameraKeyframe } from '@/store/types';
import { applyEasing } from './easings';
import { getAnimatedLine } from './lineAnimation';
import along from '@turf/along';
import length from '@turf/length';
import { lineString } from '@turf/helpers';

export interface CameraState {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpBearing(a: number, b: number, t: number): number {
  let diff = ((b - a + 540) % 360) - 180;
  return (a + diff * t + 360) % 360;
}

function lerpLngLat(a: [number, number], b: [number, number], t: number): [number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
}

export function interpolateCamera(
  kfA: CameraKeyframe,
  kfB: CameraKeyframe,
  t: number,
  getRouteCoords?: (routeId: string) => number[][] | null
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

export function getCameraAtTime(
  keyframes: CameraKeyframe[],
  time: number,
  getRouteCoords?: (routeId: string) => number[][] | null
): CameraState | null {
  if (keyframes.length === 0) return null;
  if (keyframes.length === 1) {
    const kf = keyframes[0];
    return {
      center: kf.camera.center,
      zoom: kf.camera.zoom,
      pitch: kf.camera.pitch,
      bearing: kf.camera.bearing,
    };
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

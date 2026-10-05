import mapboxgl from 'mapbox-gl';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import type { CameraItem, RouteItem } from '@/store/types';
import { extractLineCoords } from './geoUtils';
import { getCameraAtTime, type CameraOutput } from './cameraInterpolation';
import {
  blendPoses,
  poseFromFreeCam,
  poseFromJumpTo,
  poseToJumpTo,
  poseToPosition,
  type CameraPose,
} from './cameraPose';

type PlainCamera = Exclude<CameraOutput, { type: 'blend' }>;

const DEFAULT_VIEWPORT_HEIGHT = 800;
const DEG = Math.PI / 180;

function isFiniteCamera(cam: PlainCamera): boolean {
  return cam.type === 'freeCam'
    ? cam.position.every(Number.isFinite) && cam.lookAt.every(Number.isFinite)
    : cam.center.every(Number.isFinite) && Number.isFinite(cam.zoom);
}

/** Ground height in metres under a point, or 0 when terrain is off or not loaded there. */
function groundElevation(map: mapboxgl.Map, lngLat: [number, number]): number {
  if (typeof map.queryTerrainElevation !== 'function') return 0;
  const e = map.queryTerrainElevation(lngLat);
  return typeof e === 'number' && Number.isFinite(e) ? e : 0;
}

/** Places a free camera for a pose, keeping it clear of terrain and aimed at the ground below the target. */
function applyPose(map: mapboxgl.Map, pose: CameraPose): void {
  const { lngLat, horizontal, altitude } = poseToPosition(pose);
  const groundTarget = groundElevation(map, pose.target);
  const groundCamera = groundElevation(map, lngLat);
  let cameraAltitude = groundTarget + altitude;
  if (groundCamera !== 0 || groundTarget !== 0) {
    cameraAltitude = Math.max(cameraAltitude, groundCamera + Math.max(15, pose.range * 0.04));
  }

  const opts = new mapboxgl.FreeCameraOptions();
  opts.position = mapboxgl.MercatorCoordinate.fromLngLat({ lng: lngLat[0], lat: lngLat[1] }, cameraAltitude);
  if (groundTarget === 0 && cameraAltitude === altitude) {
    opts.lookAtPoint({ lng: pose.target[0], lat: pose.target[1] });
  } else {
    const drop = Math.max(1e-6, cameraAltitude - groundTarget);
    opts.setPitchBearing(Math.atan2(horizontal, drop) / DEG, pose.bearing);
  }
  map.setFreeCameraOptions(opts);
}

function viewportHeight(map: mapboxgl.Map, zoomOffset: number): number {
  const h = (map as { transform?: { height?: number } }).transform?.height;
  return (Number.isFinite(h) && h! > 0 ? h! : DEFAULT_VIEWPORT_HEIGHT) / 2 ** zoomOffset;
}

function toPose(cam: PlainCamera, refHeight: number): CameraPose {
  return cam.type === 'freeCam'
    ? poseFromFreeCam(cam.position, cam.lookAt)
    : poseFromJumpTo(cam, refHeight);
}

/** The pose a blend shows, as the renderer computes it. */
export function blendedPose(cam: Extract<CameraOutput, { type: 'blend' }>, refHeight: number): CameraPose {
  return blendPoses(toPose(cam.from, refHeight), toPose(cam.to, refHeight), cam.t);
}

function applyJumpTo(
  map: mapboxgl.Map,
  cam: { center: [number, number]; zoom: number; pitch: number; bearing: number },
  zoomOffset: number,
): void {
  const zoom = Number.isFinite(cam.zoom + zoomOffset) ? cam.zoom + zoomOffset : cam.zoom;
  const pitch = Number.isFinite(cam.pitch) ? cam.pitch : 0;
  const bearing = Number.isFinite(cam.bearing) ? cam.bearing : 0;
  map.jumpTo({ center: cam.center, zoom, pitch, bearing });
}

export function applyCamera(map: mapboxgl.Map, cam: CameraOutput, zoomOffset = 0): void {
  if (cam.type === 'blend') {
    if (!isFiniteCamera(cam.from) || !isFiniteCamera(cam.to) || !Number.isFinite(cam.t)) return;
    const refHeight = viewportHeight(map, zoomOffset);
    const pose = blendedPose(cam, refHeight);
    if (cam.from.type === 'jumpTo' && cam.to.type === 'jumpTo') {
      applyJumpTo(map, poseToJumpTo(pose, refHeight), zoomOffset);
    } else {
      applyPose(map, pose);
    }
    return;
  }
  if (!isFiniteCamera(cam)) return;
  if (cam.type === 'freeCam') {
    applyPose(map, poseFromFreeCam(cam.position, cam.lookAt));
  } else {
    applyJumpTo(map, cam, zoomOffset);
  }
}

export function getRouteCoords(routeId: string): number[][] | null {
  const route = useProjectStore.getState().items[routeId] as RouteItem | undefined;
  if (!route) return null;
  const coords = extractLineCoords(route.geojson);
  return coords.length >= 2 ? coords : null;
}

export function getRoutes(): RouteItem[] {
  return Object.values(useProjectStore.getState().items).filter((i) => i.kind === 'route') as RouteItem[];
}

/** The camera the project's camera track shows at `time`, or null if it has none. */
export function getProjectCameraAt(time: number): CameraOutput | null {
  const camera = useProjectStore.getState().items[CAMERA_TRACK_ID] as CameraItem | undefined;
  return getCameraAtTime(camera?.keyframes ?? [], time, getRouteCoords, getRoutes());
}

/** Whether a saved map centre has been set ([0, 0] means never set). */
export function hasMapCenter(center: [number, number] | undefined): center is [number, number] {
  return Boolean(center) && (center![0] !== 0 || center![1] !== 0);
}

/**
 * Moves the map to what the project shows at `time`: the camera track when it
 * has keyframes or an auto-camera, otherwise the project's saved map centre.
 * Does nothing while the camera is disabled.
 */
export function syncMapToProject(map: mapboxgl.Map, time: number): void {
  const { isCameraEnabled, mapCenter } = useProjectStore.getState();
  if (!isCameraEnabled) return;
  const cam = getProjectCameraAt(time);
  if (cam) applyCamera(map, cam);
  else if (hasMapCenter(mapCenter)) map.jumpTo({ center: mapCenter });
}

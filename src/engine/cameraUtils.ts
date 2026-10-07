import mapboxgl from 'mapbox-gl';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import type { CameraItem, RouteItem } from '@/store/types';
import { extractLineCoords } from './geoUtils';
import { getCameraAtTime, type CameraOutput } from './cameraInterpolation';
import type { GroundModel } from './cameraRig';
import { demElevation, demVersion, loadDem, type Bounds } from '@/services/terrainDem';
import { getEffectiveMapboxToken } from '@/config/mapbox';
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

/**
 * Places a free camera for a pose, measured from the ground the pose planned or else the terrain
 * under its target, kept clear of the terrain under the camera, and aimed at the target.
 */
function applyPose(map: mapboxgl.Map, pose: CameraPose): void {
  const { lngLat, horizontal, altitude } = poseToPosition(pose);
  const groundTarget = pose.ground ?? groundElevation(map, pose.target);
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
  if (cam.type === 'jumpTo') return poseFromJumpTo(cam, refHeight);
  const pose = poseFromFreeCam(cam.position, cam.lookAt);
  // The camera's own unwrapped bearing, when it has one, rather than the one re-derived from its position.
  return { ...pose, bearing: cam.bearing ?? pose.bearing, ground: cam.ground };
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
    let from = toPose(cam.from, refHeight);
    let to = toPose(cam.to, refHeight);
    // A planned ground blends with the terrain under the other end, so the hand-off stays continuous.
    if (from.ground !== undefined || to.ground !== undefined) {
      from = { ...from, ground: from.ground ?? groundElevation(map, from.target) };
      to = { ...to, ground: to.ground ?? groundElevation(map, to.target) };
    }
    const pose = blendPoses(from, to, cam.t);
    if (cam.from.type === 'jumpTo' && cam.to.type === 'jumpTo') {
      applyJumpTo(map, poseToJumpTo(pose, refHeight), zoomOffset);
    } else {
      applyPose(map, pose);
    }
    return;
  }
  if (!isFiniteCamera(cam)) return;
  if (cam.type === 'freeCam') {
    applyPose(map, { ...poseFromFreeCam(cam.position, cam.lookAt), ground: cam.ground });
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

let groundMemo: GroundModel | null = null;

/** The project's terrain as the auto-camera plans over it, or null with terrain off. */
function projectGround(): GroundModel | null {
  const { terrainEnabled, terrainExaggeration } = useProjectStore.getState();
  if (!terrainEnabled) return null;
  const key = `${terrainExaggeration}:${demVersion()}`;
  // Kept while unchanged, so the rig cache can match it by identity.
  if (groundMemo?.key !== key) {
    groundMemo = {
      key,
      elevation: (lng, lat) => {
        const e = demElevation(lng, lat);
        return e === null ? null : e * terrainExaggeration;
      },
    };
  }
  return groundMemo;
}

/** The camera the project's camera track shows at `time`, or null if it has none. */
export function getProjectCameraAt(time: number): CameraOutput | null {
  const camera = useProjectStore.getState().items[CAMERA_TRACK_ID] as CameraItem | undefined;
  return getCameraAtTime(camera?.keyframes ?? [], time, getRouteCoords, getRoutes(), projectGround());
}

/** Area an auto-camera route's shots can see the ground of: the route, plus the camera's reach. */
function autoCamBounds(route: RouteItem, coords: number[][]): Bounds {
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lng, lat] of coords) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  const config = route.autoCam!;
  // Dynamics can pull the camera back by a third or so beyond its set distance.
  const reachM = 1.5 * (config.distance + config.height);
  const dLat = reachM / 111320;
  const dLng = dLat / Math.max(0.05, Math.cos((((south + north) / 2) * Math.PI) / 180));
  return [west - dLng, Math.max(-85, south - dLat), east + dLng, Math.min(85, north + dLat)];
}

/**
 * Downloads the terrain the project's auto-cameras plan over, when terrain is on. Resolves once
 * it has arrived (or failed), so callers that need a settled plan, like export, can wait for it.
 */
export async function loadProjectTerrain(): Promise<void> {
  if (!useProjectStore.getState().terrainEnabled) return;
  const token = getEffectiveMapboxToken();
  await Promise.all(
    getRoutes()
      .filter((route) => route.autoCam?.enabled && route.autoCam.mode === 'cinematic')
      .map((route) => {
        const coords = getRouteCoords(route.id);
        return coords ? loadDem(autoCamBounds(route, coords), token) : undefined;
      }),
  );
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

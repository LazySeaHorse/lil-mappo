import mapboxgl from 'mapbox-gl';
import { useProjectStore } from '@/store/useProjectStore';
import type { RouteItem } from '@/store/types';
import type { CameraOutput } from './cameraInterpolation';

export function applyCamera(map: mapboxgl.Map, cam: CameraOutput, zoomOffset = 0): void {
  if (cam.type === 'freeCam') {
    if (
      !Number.isFinite(cam.position[0]) ||
      !Number.isFinite(cam.position[1]) ||
      !Number.isFinite(cam.position[2]) ||
      !Number.isFinite(cam.lookAt[0]) ||
      !Number.isFinite(cam.lookAt[1])
    ) {
      return;
    }
    const opts = new mapboxgl.FreeCameraOptions();
    opts.position = mapboxgl.MercatorCoordinate.fromLngLat(
      { lng: cam.position[0], lat: cam.position[1] },
      cam.position[2],
    );
    opts.lookAtPoint({ lng: cam.lookAt[0], lat: cam.lookAt[1] });
    map.setFreeCameraOptions(opts);
  } else {
    if (
      !Number.isFinite(cam.center[0]) ||
      !Number.isFinite(cam.center[1]) ||
      !Number.isFinite(cam.zoom)
    ) {
      return;
    }
    const zoom = Number.isFinite(cam.zoom + zoomOffset) ? cam.zoom + zoomOffset : cam.zoom;
    const pitch = Number.isFinite(cam.pitch) ? cam.pitch : 0;
    const bearing = Number.isFinite(cam.bearing) ? cam.bearing : 0;
    map.jumpTo({ center: cam.center, zoom, pitch, bearing });
  }
}

export function getRouteCoords(routeId: string): number[][] | null {
  const route = useProjectStore.getState().items[routeId] as RouteItem | undefined;
  if (!route) return null;
  const coords: number[][] = [];
  for (const f of route.geojson.features) {
    if (f.geometry?.type === 'LineString' && Array.isArray((f.geometry as GeoJSON.LineString).coordinates)) {
      coords.push(...(f.geometry as GeoJSON.LineString).coordinates);
    } else if (f.geometry?.type === 'MultiLineString' && Array.isArray((f.geometry as GeoJSON.MultiLineString).coordinates)) {
      for (const l of (f.geometry as GeoJSON.MultiLineString).coordinates) {
        if (Array.isArray(l)) coords.push(...l);
      }
    }
  }
  return coords.length >= 2 ? coords : null;
}

export function getRoutes(): RouteItem[] {
  return Object.values(useProjectStore.getState().items).filter((i) => i.kind === 'route') as RouteItem[];
}

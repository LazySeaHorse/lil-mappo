import mapboxgl from 'mapbox-gl';
import { useProjectStore } from '@/store/useProjectStore';
import type { RouteItem } from '@/store/types';
import type { CameraOutput } from './cameraInterpolation';

export function applyCamera(map: mapboxgl.Map, cam: CameraOutput, zoomOffset = 0): void {
  if (cam.type === 'freeCam') {
    const opts = new mapboxgl.FreeCameraOptions();
    opts.position = mapboxgl.MercatorCoordinate.fromLngLat(
      { lng: cam.position[0], lat: cam.position[1] },
      cam.position[2],
    );
    opts.lookAtPoint({ lng: cam.lookAt[0], lat: cam.lookAt[1] });
    map.setFreeCameraOptions(opts);
  } else {
    map.jumpTo({ center: cam.center, zoom: cam.zoom + zoomOffset, pitch: cam.pitch, bearing: cam.bearing });
  }
}

export function getRouteCoords(routeId: string): number[][] | null {
  const route = useProjectStore.getState().items[routeId] as RouteItem | undefined;
  if (!route) return null;
  const coords: number[][] = [];
  for (const f of route.geojson.features) {
    if (f.geometry.type === 'LineString') coords.push(...(f.geometry as GeoJSON.LineString).coordinates);
    else if (f.geometry.type === 'MultiLineString') for (const l of (f.geometry as GeoJSON.MultiLineString).coordinates) coords.push(...l);
  }
  return coords.length >= 2 ? coords : null;
}

export function getRoutes(): RouteItem[] {
  return Object.values(useProjectStore.getState().items).filter((i) => i.kind === 'route') as RouteItem[];
}

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import { getCameraAtTime, type CameraOutput } from '@/engine/cameraInterpolation';
import type { CameraItem, RouteItem } from '@/store/types';

function applyCamera(map: any, cam: CameraOutput, zoomOffset = 0): void {
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

export function usePlayback(mapRef: React.RefObject<any>) {
  const rafRef = useRef<number>(0);
  const startWallRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    const getRouteCoords = (routeId: string): number[][] | null => {
      const store = useProjectStore.getState();
      const route = store.items[routeId] as RouteItem | undefined;
      if (!route) return null;
      const coords: number[][] = [];
      for (const f of route.geojson.features) {
        if (f.geometry.type === 'LineString') coords.push(...(f.geometry as any).coordinates);
        else if (f.geometry.type === 'MultiLineString') for (const l of (f.geometry as any).coordinates) coords.push(...l);
      }
      return coords.length >= 2 ? coords : null;
    };

    const getRoutes = (): RouteItem[] =>
      Object.values(useProjectStore.getState().items).filter((i) => i.kind === 'route') as RouteItem[];

    const driveCamera = (time: number) => {
      const store = useProjectStore.getState();
      if (!store.isCameraEnabled) return;
      const camItem = store.items[CAMERA_TRACK_ID] as CameraItem | undefined;
      if (!camItem || !mapRef.current) return;

      const routes = getRoutes();
      const cam = getCameraAtTime(camItem.keyframes, time, getRouteCoords, routes);
      if (cam) {
        const map = mapRef.current.getMap?.() || mapRef.current;
        if (map?.jumpTo) applyCamera(map, cam);
      }
    };

    const unsub = useProjectStore.subscribe((state, prev) => {
      if (state.isPlaying && !prev.isPlaying) {
        startWallRef.current = performance.now();
        startTimeRef.current = state.playheadTime;
        const loop = () => {
          const store = useProjectStore.getState();
          if (!store.isPlaying) return;
          const elapsed = (performance.now() - startWallRef.current) / 1000;
          const currentTime = startTimeRef.current + elapsed;
          if (currentTime >= store.duration) {
            store.setPlayheadTime(0);
            store.setIsPlaying(false);
            return;
          }
          store.setPlayheadTime(currentTime);
          driveCamera(currentTime);
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      }

      if (!state.isPlaying && prev.isPlaying) {
        cancelAnimationFrame(rafRef.current);
      }

      if (!state.isPlaying && state.playheadTime !== prev.playheadTime) {
        driveCamera(state.playheadTime);
      }
    });

    return () => {
      unsub();
      cancelAnimationFrame(rafRef.current);
    };
  }, [mapRef]);
}

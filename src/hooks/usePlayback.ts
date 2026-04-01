import { useEffect, useRef } from 'react';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import { getCameraAtTime } from '@/engine/cameraInterpolation';
import type { CameraItem, RouteItem } from '@/store/types';

export function usePlayback(mapRef: React.RefObject<any>) {
  const rafRef = useRef<number>(0);
  const startWallRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
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

          // Drive camera
          const camItem = store.items[CAMERA_TRACK_ID] as CameraItem | undefined;
          if (camItem && camItem.keyframes.length > 0 && mapRef.current) {
            const getRouteCoords = (routeId: string) => {
              const route = store.items[routeId] as RouteItem | undefined;
              if (!route) return null;
              const coords: number[][] = [];
              for (const f of route.geojson.features) {
                if (f.geometry.type === 'LineString') coords.push(...(f.geometry as any).coordinates);
                else if (f.geometry.type === 'MultiLineString') for (const l of (f.geometry as any).coordinates) coords.push(...l);
              }
              return coords.length >= 2 ? coords : null;
            };

            const cam = getCameraAtTime(camItem.keyframes, currentTime, getRouteCoords);
            if (cam) {
              const map = mapRef.current.getMap?.() || mapRef.current;
              if (map?.jumpTo) {
                map.jumpTo({
                  center: cam.center,
                  zoom: cam.zoom,
                  pitch: cam.pitch,
                  bearing: cam.bearing,
                });
              }
            }
          }

          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      }

      if (!state.isPlaying && prev.isPlaying) {
        cancelAnimationFrame(rafRef.current);
      }
    });

    return () => {
      unsub();
      cancelAnimationFrame(rafRef.current);
    };
  }, [mapRef]);
}

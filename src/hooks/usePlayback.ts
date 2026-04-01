import { useEffect, useRef } from 'react';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import { getCameraAtTime } from '@/engine/cameraInterpolation';
import type { CameraItem, RouteItem } from '@/store/types';

export function usePlayback(mapRef: React.RefObject<any>) {
  const rafRef = useRef<number>(0);
  const startWallRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    const getRouteCoords = (routeId: string) => {
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

    const driveCamera = (time: number) => {
      const store = useProjectStore.getState();
      const camItem = store.items[CAMERA_TRACK_ID] as CameraItem | undefined;
      if (!camItem || camItem.keyframes.length === 0 || !mapRef.current) return;

      const cam = getCameraAtTime(camItem.keyframes, time, getRouteCoords);
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
    };

    const unsub = useProjectStore.subscribe((state, prev) => {
      // Start playback loop
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

      // Stop playback loop
      if (!state.isPlaying && prev.isPlaying) {
        cancelAnimationFrame(rafRef.current);
      }

      // Drive camera on scrub (when not playing, if playhead changed)
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

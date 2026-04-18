import { useEffect, useRef } from 'react';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import { getCameraAtTime } from '@/engine/cameraInterpolation';
import { applyCamera, getRouteCoords, getRoutes } from '@/engine/cameraUtils';
import type { CameraItem } from '@/store/types';

export function usePlayback(mapRef: React.RefObject<any>) {
  const rafRef = useRef<number>(0);
  const startWallRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {

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

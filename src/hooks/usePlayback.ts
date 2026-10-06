import { useEffect, useRef } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import { syncMapToProject } from '@/engine/cameraUtils';

export function usePlayback(mapRef: React.RefObject<MapRef | null> | React.MutableRefObject<MapRef | null>) {
  const rafRef = useRef<number>(0);
  const startWallRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {

    // The initial sync happens in MapViewport once the map is ready.
    const driveCamera = (time: number) => {
      const map = mapRef.current?.getMap();
      if (map) syncMapToProject(map, time);
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

      if (
        !state.isPlaying &&
        (state.playheadTime !== prev.playheadTime ||
          state.id !== prev.id ||
          state.items[CAMERA_TRACK_ID] !== prev.items[CAMERA_TRACK_ID])
      ) {
        driveCamera(state.playheadTime);
      }
    });

    // rAF stops while the tab is hidden but the wall clock does not, so pause
    // to keep the playhead from jumping forward on return.
    const onVisibilityChange = () => {
      const store = useProjectStore.getState();
      if (document.hidden && store.isPlaying && !store.isExporting) store.setIsPlaying(false);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      cancelAnimationFrame(rafRef.current);
    };
  }, [mapRef]);
}

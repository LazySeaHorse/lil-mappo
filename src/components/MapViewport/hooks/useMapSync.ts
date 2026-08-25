import { useEffect, useRef } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
import { useProjectStore } from '@/store/useProjectStore';
import { BasemapController } from '../runtime/BasemapController';

export function useMapSync(
  mapRef: React.MutableRefObject<MapRef | null>,
  mapReady: boolean,
  styleLoaded: boolean,
  setStyleLoaded: (loaded: boolean) => void,
) {
  const controllerRef = useRef<BasemapController | null>(null);
  const syncRef = useRef<() => void>(() => {});

  const mapStyle = useProjectStore((state) => state.mapStyle);
  const terrainEnabled = useProjectStore((state) => state.terrainEnabled);
  const buildingsEnabled = useProjectStore((state) => state.buildingsEnabled);
  const terrainExaggeration = useProjectStore((state) => state.terrainExaggeration);
  const projection = useProjectStore((state) => state.projection);
  const lightPreset = useProjectStore((state) => state.lightPreset);
  const labelVisibility = useProjectStore((state) => state.labelVisibility);
  const show3dLandmarks = useProjectStore((state) => state.show3dLandmarks);
  const show3dTrees = useProjectStore((state) => state.show3dTrees);
  const show3dFacades = useProjectStore((state) => state.show3dFacades);
  const starIntensity = useProjectStore((state) => state.starIntensity);
  const fogColor = useProjectStore((state) => state.fogColor);
  const terrainLoading = useProjectStore((state) => state.terrainLoading);
  const detectedCapabilities = useProjectStore((state) => state.detectedCapabilities);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    const controller = new BasemapController(map, setStyleLoaded);
    controllerRef.current = controller;
    syncRef.current = controller.reconcile;
    controller.mount();

    return () => {
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
      if (syncRef.current === controller.reconcile) syncRef.current = () => {};
    };
  }, [mapReady, mapRef, setStyleLoaded]);

  useEffect(() => {
    controllerRef.current?.reconcile();
  }, [
    mapStyle,
    projection,
    terrainEnabled,
    terrainExaggeration,
    buildingsEnabled,
    lightPreset,
    labelVisibility,
    show3dLandmarks,
    show3dTrees,
    show3dFacades,
    starIntensity,
    fogColor,
    styleLoaded,
    terrainLoading,
    detectedCapabilities,
  ]);

  return { syncRef };
}

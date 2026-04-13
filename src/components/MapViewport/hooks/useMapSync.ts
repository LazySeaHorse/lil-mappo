import { useEffect, useCallback, useMemo, useRef } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
import { useProjectStore } from '@/store/useProjectStore';
import { detectRuntimeCapabilities } from '../mapUtils';

export function useMapSync(
  mapRef: React.MutableRefObject<MapRef | null>,
  mapReady: boolean,
  styleLoaded: boolean,
  setStyleLoaded: (loaded: boolean) => void,
) {
  const mapStyle = useProjectStore((s) => s.mapStyle);
  const terrainEnabled = useProjectStore((s) => s.terrainEnabled);
  const buildingsEnabled = useProjectStore((s) => s.buildingsEnabled);
  const terrainExaggeration = useProjectStore((s) => s.terrainExaggeration);
  const projection = useProjectStore((s) => s.projection);
  const lightPreset = useProjectStore((s) => s.lightPreset);
  const labelVisibility = useProjectStore((s) => s.labelVisibility);
  const show3dLandmarks = useProjectStore((s) => s.show3dLandmarks);
  const show3dTrees = useProjectStore((s) => s.show3dTrees);
  const show3dFacades = useProjectStore((s) => s.show3dFacades);
  const starIntensity = useProjectStore((s) => s.starIntensity);
  const fogColor = useProjectStore((s) => s.fogColor);
  const terrainLoading = useProjectStore((s) => s.terrainLoading);
  const buildingsLoading = useProjectStore((s) => s.buildingsLoading);
  const detectedCapabilities = useProjectStore((s) => s.detectedCapabilities);

  const fogConfig = useMemo(() => {
    let baseFog;
    if (mapStyle === 'satellite' || mapStyle === 'satelliteStreets') {
      baseFog = {
        'color': '#5d7883',
        'high-color': 'rgb(36, 92, 223)',
        'horizon-blend': 0.4,
        'space-color': 'rgb(11, 11, 25)',
        'star-intensity': 0.6,
      };
    } else if (mapStyle === 'dark') {
      baseFog = {
        'color': 'rgb(23, 23, 23)',       
        'high-color': 'rgb(10, 10, 40)',  
        'horizon-blend': 0.3,
        'space-color': 'rgb(5, 5, 15)',   
        'star-intensity': 0.8,
      };
    } else {
      baseFog = {
        'color': 'rgb(186, 210, 235)',
        'high-color': 'rgb(36, 92, 223)',
        'horizon-blend': 0.02,
        'space-color': 'rgb(11, 11, 25)',
        'star-intensity': 0.6,
      };
    }

    return {
      ...baseFog,
      'color': fogColor ?? baseFog['color'],
      'star-intensity': starIntensity ?? baseFog['star-intensity']
    };
  }, [mapStyle, starIntensity, fogColor]);

  const syncRef = useRef<() => void>(() => {});

  const toggleFeature = useCallback((map: any, pkg: string, prop: string, layerIdPatterns: string | string[], visible: boolean) => {
    const s = useProjectStore.getState();

    if (s.mapStyle === 'standard') {
      try {
        const configPropMap: Record<string, string> = {
          'place': 'showPlaceLabels',
          'admin': 'showAdminBoundaries',
          'road': 'showRoadLabels',
          'poi': 'showPointOfInterestLabels',
          'transit': 'showTransitLabels',
        };
        const configProp = configPropMap[prop];
        if (configProp && map.getConfigProperty(pkg, configProp) !== visible) {
          map.setConfigProperty(pkg, configProp, visible);
        }
      } catch (e) {}
    }

    const layers = map.getStyle()?.layers || [];
    const patterns = Array.isArray(layerIdPatterns) ? layerIdPatterns : [layerIdPatterns];
    const matches = layers.filter((l: any) =>
      patterns.some(p => l.id.toLowerCase().includes(p.toLowerCase()))
    );

    for (const layer of matches) {
      try {
        const currentVis = map.getLayoutProperty(layer.id, 'visibility');
        const targetVis = visible ? 'visible' : 'none';
        if (currentVis !== targetVis) {
          map.setLayoutProperty(layer.id, 'visibility', targetVis);
        }
      } catch (e) {}
    }
  }, []);

  syncRef.current = () => {
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded()) return;
    const s = useProjectStore.getState();

    try {
      if (map.getProjection().name !== s.projection) {
        map.setProjection({ name: s.projection });
      }

      const buildingsOn = s.buildingsEnabled;
      
      if (s.mapStyle === 'standard') {
        if (map.getConfigProperty('basemap', 'lightPreset') !== s.lightPreset) {
          map.setConfigProperty('basemap', 'lightPreset', s.lightPreset);
        }
        
        map.setConfigProperty('basemap', 'show3dObjects', buildingsOn);
        map.setConfigProperty('basemap', 'show3dLandmarks', buildingsOn && s.show3dLandmarks);
        map.setConfigProperty('basemap', 'show3dTrees', buildingsOn && s.show3dTrees);
        map.setConfigProperty('basemap', 'show3dFacades', buildingsOn && s.show3dFacades);
      } else if (map.getLayer('3d-buildings')) {
        const vis = buildingsOn ? 'visible' : 'none';
        if (map.getLayoutProperty('3d-buildings', 'visibility') !== vis) {
          map.setLayoutProperty('3d-buildings', 'visibility', vis);
        }
      }

      if (s.detectedCapabilities) {
        s.detectedCapabilities.labelGroups.forEach((group) => {
          const isVisible = s.labelVisibility[group.id] ?? true;
          toggleFeature(map, 'basemap', group.id, group.layerPatterns, isVisible);
        });
      }

      if (s.terrainEnabled) {
        if (!map.getSource('mapbox-dem')) {
          map.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512,
            maxzoom: 14,
          });
        }
        const currentTerrain = (map as any).getTerrain();
        const isSameTerrain = currentTerrain && 
          currentTerrain.source === 'mapbox-dem' && 
          Math.abs(currentTerrain.exaggeration - s.terrainExaggeration) < 0.001;

        if (!isSameTerrain) {
          map.setTerrain({ source: 'mapbox-dem', exaggeration: s.terrainExaggeration });
        }
      } else {
        if ((map as any).getTerrain()) {
          map.setTerrain(null);
        }
      }

      const targetFog = fogConfig as any;
      const currentFog = map.getFog();
      
      const needsFogSync = !currentFog || 
        currentFog.color !== targetFog.color || 
        Math.abs((currentFog['star-intensity'] || 0) - (targetFog['star-intensity'] || 0)) > 0.005 ||
        currentFog['space-color'] !== targetFog['space-color'];

      if (needsFogSync) {
        map.setFog(targetFog);
      }

    } catch (err) {
      console.warn('Sync engine failure (async transition):', err);
    }
  };

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    const handleStyleLoad = () => {
      const s = useProjectStore.getState();
      const detected = detectRuntimeCapabilities(map, s.mapStyle);
      s.setDetectedCapabilities(detected);
      setStyleLoaded(true);
      syncRef.current();
    };
    
    const handleStyleImportData = () => syncRef.current();
    const handleSourceData = (e: any) => {
      if (e.sourceId === 'mapbox-dem') {
        syncRef.current();
        const s = useProjectStore.getState();
        if (s.isPlaying || !s.terrainEnabled) return;

        requestAnimationFrame(() => {
          if (useProjectStore.getState().terrainEnabled) {
            const isLoaded = map.getSource('mapbox-dem') && map.isSourceLoaded('mapbox-dem');
            useProjectStore.getState().setTerrainLoading(!isLoaded);
          }
        });
      }
    };
    const handleSourceDataLoading = (e: any) => {
      if (e.sourceId === 'mapbox-dem') {
        const s = useProjectStore.getState();
        if (s.isPlaying || !s.terrainEnabled) return;

        requestAnimationFrame(() => {
          if (useProjectStore.getState().terrainEnabled) {
            useProjectStore.getState().setTerrainLoading(true);
          }
        });
      }
    };
    const handleIdle = () => {
      syncRef.current();
      const s = useProjectStore.getState();
      if (s.isPlaying) return;

      const sourceExists = map.getSource('mapbox-dem');
      if (s.terrainLoading && (!s.terrainEnabled || (sourceExists && map.isSourceLoaded('mapbox-dem')))) {
        requestAnimationFrame(() => {
          useProjectStore.getState().setTerrainLoading(false);
        });
      }
    };

    map.on('style.load', handleStyleLoad);
    map.on('styleimportdata', handleStyleImportData);
    map.on('sourcedataloading', handleSourceDataLoading);
    map.on('sourcedata', handleSourceData);
    map.on('idle', handleIdle);

    (map as any)._syncRef = syncRef;
    syncRef.current();

    const allHandlers = [
      map.dragPan, map.dragRotate, map.scrollZoom,
      map.touchZoomRotate, map.doubleClickZoom, map.keyboard,
    ];
    const unsubInteractive = useProjectStore.subscribe((state, prev) => {
      if (state.isPlaying === prev.isPlaying) return;
      if (state.isPlaying) {
        allHandlers.forEach(h => h?.disable());
      } else {
        allHandlers.forEach(h => h?.enable());
      }
    });

    return () => {
      unsubInteractive();
      delete (map as any)._syncRef;
      map.off('style.load', handleStyleLoad);
      map.off('styleimportdata', handleStyleImportData);
      map.off('sourcedataloading', handleSourceDataLoading);
      map.off('sourcedata', handleSourceData);
      map.off('idle', handleIdle);
    };
  }, [mapReady]);

  useEffect(() => {
    syncRef.current();
  }, [
    mapStyle, projection, terrainEnabled, terrainExaggeration, fogConfig,
    buildingsEnabled, lightPreset, labelVisibility, show3dLandmarks,
    show3dTrees, show3dFacades, styleLoaded, terrainLoading, buildingsLoading,
    detectedCapabilities
  ]);

  return { syncRef };
}

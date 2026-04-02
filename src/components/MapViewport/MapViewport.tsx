import React, { useEffect, useCallback, useMemo } from 'react';
import MapGL, { Source, Layer, Marker } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import { MAPBOX_TOKEN, MAP_STYLES } from '@/config/mapbox';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import type { RouteItem, BoundaryItem, CalloutItem, CameraItem } from '@/store/types';
import { applyEasing, getNormalizedProgress } from '@/engine/easings';
import CalloutCard from './CalloutCard';
import { extractLineStringsFromGeometry } from '@/engine/geoUtils';
import { getLineSegment, getAnimatedLine } from '@/engine/lineAnimation';




interface MapViewportProps {
  mapRef: React.MutableRefObject<MapRef | null>;
}

export default function MapViewport({ mapRef }: MapViewportProps) {
  const {
    mapStyle, terrainEnabled, buildingsEnabled, terrainExaggeration,
    projection, lightPreset, showRoadLabels, showPlaceLabels, showPointOfInterestLabels, showTransitLabels,
    show3dLandmarks, show3dTrees, show3dFacades, mapLanguage, starIntensity, fogColor,
    items, itemOrder, playheadTime, isPlaying,
    selectedItemId, updateItem, selectItem, isMoveModeActive,
  } = useProjectStore();

  const styleUrl = MAP_STYLES[mapStyle]?.url || MAP_STYLES.streets.url;

  const handleMapClick = useCallback((e: any) => {
    const selected = useProjectStore.getState().selectedItemId;
    if (selected) {
      const item = useProjectStore.getState().items[selected];
      if (item?.kind === 'callout' && (item as CalloutItem).lngLat[0] === 0 && (item as CalloutItem).lngLat[1] === 0) {
        updateItem(selected, { lngLat: [e.lngLat.lng, e.lngLat.lat] } as any);
        return;
      }
    }
  }, [updateItem]);

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
  /**
   * Unified Mapbox Synchronization Engine
   * Handles all imperative state (Projection, Terrain, Fog, Config, and Labels) 
   * across all Mapbox styles (Standard, Satellite, Streets, etc.)
   */
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    /**
     * Helper: Unified visibility toggler for both Standard Configs and Legacy Layers
     * pkg/prop: Only for Standard styles
     * layerIdPatterns: Substrings to match layer IDs in legacy styles
     */
    const toggleFeature = (pkg: string, prop: string, layerIdPatterns: string | string[], visible: boolean) => {
      const s = useProjectStore.getState();
      
      // 1. Try Mapbox v3 Standard Config
      if (s.mapStyle === 'standard') {
        try {
          if (map.getConfigProperty(pkg, prop) !== visible) {
            map.setConfigProperty(pkg, prop, visible);
          }
        } catch (e) {}
      } 
      
      // 2. Always check Legacy Layers (essential for Satellite-Streets, etc.)
      const layers = map.getStyle()?.layers || [];
      const patterns = Array.isArray(layerIdPatterns) ? layerIdPatterns : [layerIdPatterns];
      const matches = layers.filter(l =>
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
    };

    /**
     * The "Pure" Sync Function: Applies all store properties to the map instance.
     */
    const syncEverything = () => {
      if (!map.isStyleLoaded()) return;
      const s = useProjectStore.getState();

      try {
        // 1. Projection
        if (map.getProjection().name !== s.projection) {
          map.setProjection({ name: s.projection });
        }

        // 2. 3D Terrain — source is always mounted, sourcedata handler retries if not ready yet
        if (s.terrainEnabled) {
          if (map.getSource('mapbox-dem')) {
            map.setTerrain({ source: 'mapbox-dem', exaggeration: s.terrainExaggeration });
          }
        } else {
          if (map.getTerrain()) map.setTerrain(null);
        }

        // 3. Atmosphere (supported in both globe and mercator)
        map.setFog(fogConfig as any);

        // 4. Map Language
        if (s.mapLanguage && (map as any).setLanguage) {
          (map as any).setLanguage(s.mapLanguage);
        }

        // 5. 3D Buildings & Details
        const buildingsOn = s.buildingsEnabled;
        
        if (s.mapStyle === 'standard') {
          map.setConfigProperty('basemap', 'show3dObjects', buildingsOn);
          map.setConfigProperty('basemap', 'show3dLandmarks', buildingsOn && s.show3dLandmarks);
          map.setConfigProperty('basemap', 'show3dTrees', buildingsOn && s.show3dTrees);
          map.setConfigProperty('basemap', 'show3dFacades', buildingsOn && s.show3dFacades);
          map.setConfigProperty('basemap', 'lightPreset', s.lightPreset);
        } else if (map.getLayer('3d-buildings')) {
          map.setLayoutProperty('3d-buildings', 'visibility', buildingsOn ? 'visible' : 'none');
        }

        // 6. Labels (multiple patterns for broader style coverage)
        toggleFeature('basemap', 'showRoadLabels', ['road-label', 'road-number', 'road-shield'], s.showRoadLabels);
        toggleFeature('basemap', 'showPlaceLabels', ['settlement-label', 'place-city', 'place-town', 'place-village', 'place-label', 'country-label', 'state-label'], s.showPlaceLabels);
        toggleFeature('basemap', 'showPointOfInterestLabels', ['poi-label'], s.showPointOfInterestLabels);
        toggleFeature('basemap', 'showTransitLabels', ['transit-label', 'airport-label', 'ferry'], s.showTransitLabels);

      } catch (err) {
        console.warn('Sync loop minor failure (normal during re-load):', err);
      }
    };

    const handleSync = () => syncEverything();
    const handleSourceData = (e: any) => {
      // Re-sync on any DEM source event (not just isSourceLoaded) to catch terrain readiness
      if (e.sourceId === 'mapbox-dem') syncEverything();
    };
    const handleIdle = () => {
      const s = useProjectStore.getState();
      // Only clear terrain loading once terrain is actually active on the map
      if (s.terrainLoading) {
        if (!s.terrainEnabled || map.getTerrain()) s.setTerrainLoading(false);
      }
      if (s.buildingsLoading) s.setBuildingsLoading(false);
    };

    map.on('style.load', handleSync);
    map.on('styleimportdata', handleSync);
    map.on('sourcedata', handleSourceData);
    map.on('idle', handleIdle);

    syncEverything();

    return () => {
      map.off('style.load', handleSync);
      map.off('styleimportdata', handleSync);
      map.off('sourcedata', handleSourceData);
      map.off('idle', handleIdle);
    };
  }, [
    mapStyle, projection, terrainEnabled, terrainExaggeration, fogConfig,
    buildingsEnabled, lightPreset, showRoadLabels, showPlaceLabels, 
    showPointOfInterestLabels, showTransitLabels, show3dLandmarks, 
    show3dTrees, show3dFacades, mapLanguage
  ]);

  const routes: RouteItem[] = [];
  const boundaries: BoundaryItem[] = [];
  const callouts: CalloutItem[] = [];

  for (const id of itemOrder) {
    const item = items[id];
    if (!item) continue;
    if (item.kind === 'route') routes.push(item);
    else if (item.kind === 'boundary') boundaries.push(item);
    else if (item.kind === 'callout') callouts.push(item);
  }

  return (
    <div className="w-full h-full relative">
      <MapGL
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ longitude: -73.97, latitude: 40.77, zoom: 12, pitch: 0, bearing: 0 }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={styleUrl}
        onClick={handleMapClick}
        interactive={!isPlaying}
        preserveDrawingBuffer
      >
        {/* DEM source always mounted — terrain controlled by sync engine */}
        <Source id="mapbox-dem" type="raster-dem" url="mapbox://mapbox.mapbox-terrain-dem-v1" tileSize={512} maxzoom={14} />

        {/* Buildings layer for non-Standard styles — visibility controlled by sync engine */}
        {mapStyle !== 'standard' && mapStyle !== 'satellite' && (
          <Layer
            id="3d-buildings"
            source="composite"
            source-layer="building"
            type="fill-extrusion"
            minzoom={14}
            paint={{
              'fill-extrusion-color': '#ddd',
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'min_height'],
              'fill-extrusion-opacity': 0.8,
            }}
            layout={{ 'visibility': 'none' }}
          />
        )}

        {/* Project Items */}
        {routes.map((route) => (
          <RouteLayerGroup key={route.id} route={route} playheadTime={playheadTime} />
        ))}
        {boundaries.map((boundary) => (
          <BoundaryLayerGroup key={boundary.id} boundary={boundary} playheadTime={playheadTime} />
        ))}
        {callouts
          .filter((c) => {
            // Visible if within time range OR if it's the selected item in move mode
            const isManualMoving = isMoveModeActive && selectedItemId === c.id;
            const isVisibleTime = playheadTime >= c.startTime && playheadTime <= c.endTime;
            return isManualMoving || isVisibleTime;
          })
          .map((callout) => (
            <CalloutMarker 
              key={callout.id} 
              callout={callout} 
              playheadTime={playheadTime} 
              mapRef={mapRef} 
              isSelected={selectedItemId === callout.id}
              isMoveModeActive={isMoveModeActive}
            />
          ))}
      </MapGL>
    </div>
  );
}

function RouteLayerGroup({ route, playheadTime }: { route: RouteItem; playheadTime: number }) {
  const coords = React.useMemo(() => {
    const allCoords: number[][] = [];
    for (const feature of route.geojson.features) {
      const geom = feature.geometry;
      if (geom.type === 'LineString') allCoords.push(...(geom as any).coordinates);
      else if (geom.type === 'MultiLineString') for (const line of (geom as any).coordinates) allCoords.push(...line);
    }
    return allCoords;
  }, [route.geojson]);

  const progress = getNormalizedProgress(playheadTime, route.startTime, route.endTime, route.easing);
  const animatedData = React.useMemo(() => {
    if (coords.length < 2) return null;
    const animCoords = getAnimatedLine(coords, progress);
    if (animCoords.length < 2) return null;
    return { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: animCoords } };
  }, [coords, progress]);

  if (!animatedData) return null;
  const geojsonData: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [animatedData] };

  return (
    <>
      {route.style.glow && (
        <Source id={`route-glow-${route.id}`} type="geojson" data={geojsonData}>
          <Layer id={`route-glow-layer-${route.id}`} type="line" paint={{ 'line-color': route.style.glowColor, 'line-width': route.style.width * 3, 'line-opacity': 0.35, 'line-blur': route.style.width * 2 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
        </Source>
      )}
      <Source id={`route-${route.id}`} type="geojson" data={geojsonData}>
        <Layer id={`route-layer-${route.id}`} type="line" paint={{ 'line-color': route.style.color, 'line-width': route.style.width, 'line-opacity': 1 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
      </Source>
    </>
  );
}

function BoundaryLayerGroup({ boundary, playheadTime }: { boundary: BoundaryItem; playheadTime: number }) {
  if (!boundary.geojson || boundary.resolveStatus !== 'resolved') return null;
  
  const progress = getNormalizedProgress(playheadTime, boundary.startTime, boundary.endTime, boundary.easing);

  const style = boundary.style;
  const isAnimating = style.animateStroke;
  const animStyle = style.animationStyle || 'fade';
  const traceLen = style.traceLength || 0.1;

  // 1. Prepare Fill Data (The full polygon)
  const fillProgress = animStyle === 'fade' ? progress : Math.max(0, (progress - 0.7) / 0.3);
  const fillOpacity = style.fillOpacity * fillProgress;
  const fillGeoJSON: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: boundary.geojson }] };

  // 2. Prepare Stroke Data
  const strokeGeoJSON = React.useMemo(() => {
    if (!isAnimating || animStyle === 'fade') {
      return fillGeoJSON;
    }

    const rings = extractLineStringsFromGeometry(boundary.geojson!);
    const animatedRings: number[][][] = [];

    for (const ring of rings) {
      let segment: number[][];
      if (animStyle === 'draw') {
        segment = getLineSegment(ring, 0, progress);
      } else {
        const start = progress * (1 + traceLen) - traceLen;
        const end = progress * (1 + traceLen);
        segment = getLineSegment(ring, start, end);
      }
      
      if (segment.length >= 2) {
        animatedRings.push(segment);
      }
    }

    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'MultiLineString',
          coordinates: animatedRings
        }
      }]
    } as GeoJSON.FeatureCollection;
  }, [boundary.geojson, isAnimating, animStyle, progress, traceLen]);

  const strokeOpacity = animStyle === 'fade' 
    ? Math.min(progress * 2, 1) 
    : (progress > 0 ? 1 : 0);

  return (
    <>
      <Source id={`boundary-fill-${boundary.id}`} type="geojson" data={fillGeoJSON}>
        <Layer id={`boundary-fill-layer-${boundary.id}`} type="fill" paint={{ 'fill-color': style.fillColor, 'fill-opacity': fillOpacity }} />
      </Source>
      {progress > 0 && (
        <Source id={`boundary-stroke-${boundary.id}`} type="geojson" data={strokeGeoJSON}>
          <Layer 
            id={`boundary-stroke-layer-${boundary.id}`} 
            type="line" 
            paint={{ 
              'line-color': style.strokeColor, 
              'line-width': style.strokeWidth, 
              'line-opacity': strokeOpacity 
            }} 
            layout={{ 'line-cap': 'round', 'line-join': 'round' }} 
          />
        </Source>
      )}
    </>
  );
}

function CalloutMarker({ 
  callout, playheadTime, mapRef, isSelected, isMoveModeActive 
}: { 
  callout: CalloutItem; 
  playheadTime: number; 
  mapRef: React.MutableRefObject<MapRef | null>;
  isSelected: boolean;
  isMoveModeActive: boolean;
}) {
  const updateItem = useProjectStore(s => s.updateItem);
  const debounceRef = React.useRef<NodeJS.Timeout | null>(null);

  const isActuallyInMoveMode = isSelected && isMoveModeActive;

  const handleDragEnd = useCallback((e: any) => {
    const newLngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
    
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    debounceRef.current = setTimeout(() => {
      updateItem(callout.id, { lngLat: newLngLat } as any);
    }, 500);
  }, [callout.id, updateItem]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (callout.lngLat[0] === 0 && callout.lngLat[1] === 0) return null;

  const enterEnd = callout.startTime + callout.animation.enterDuration;
  const exitStart = callout.endTime - callout.animation.exitDuration;
  let phase: 'enter' | 'visible' | 'exit' = 'visible';
  let animProgress = 1;
  if (playheadTime < enterEnd) { phase = 'enter'; animProgress = (playheadTime - callout.startTime) / callout.animation.enterDuration; }
  else if (playheadTime > exitStart) { phase = 'exit'; animProgress = (playheadTime - exitStart) / callout.animation.exitDuration; }

  // Compute pixel offset for altitude (3D effect via marker offset)
  const map = mapRef.current?.getMap?.();
  let altitudeOffset = 0;
  if (map && callout.altitude > 0) {
    const zoom = map.getZoom();
    const metersPerPixel = 156543.03392 * Math.cos(callout.lngLat[1] * Math.PI / 180) / Math.pow(2, zoom);
    altitudeOffset = callout.altitude / metersPerPixel;
    altitudeOffset = Math.min(altitudeOffset, 300);
  }

  // If in move mode, show crosshair at altitude 0
  if (isActuallyInMoveMode) {
    return (
      <Marker
        longitude={callout.lngLat[0]}
        latitude={callout.lngLat[1]}
        anchor="center"
        draggable
        onDragEnd={handleDragEnd}
      >
        <div className="group relative flex items-center justify-center cursor-move">
          {/* Pulsing ring */}
          <div className="absolute w-12 h-12 rounded-full border-2 border-primary/50 animate-ping" />
          {/* Crosshair SVG */}
          <svg width="40" height="40" viewBox="0 0 40 40" className="text-primary drop-shadow-lg scale-110">
            <circle cx="20" cy="20" r="4" fill="currentColor" />
            <path d="M20 5 L20 15 M20 25 L20 35 M5 20 L15 20 M25 20 L35 20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
          </svg>
          {/* Coordinates tooltip */}
          <div className="absolute top-10 whitespace-nowrap bg-background/90 text-[10px] px-1.5 py-0.5 rounded border border-border shadow-sm font-mono opacity-0 group-hover:opacity-100 transition-opacity">
            {callout.lngLat[1].toFixed(4)}, {callout.lngLat[0].toFixed(4)}
          </div>
        </div>
      </Marker>
    );
  }

  return (
    <Marker
      longitude={callout.lngLat[0]}
      latitude={callout.lngLat[1]}
      anchor="bottom"
      offset={[0, 0] as [number, number]}
    >
      <CalloutCard callout={callout} phase={phase} progress={animProgress} altitudeOffset={altitudeOffset} />
    </Marker>
  );
}

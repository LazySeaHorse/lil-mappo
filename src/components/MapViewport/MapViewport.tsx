import React, { useEffect, useCallback, useMemo } from 'react';
import MapGL, { Source, Layer, Marker } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import { MAPBOX_TOKEN, MAP_STYLES } from '@/config/mapbox';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import type { RouteItem, BoundaryItem, CalloutItem, CameraItem } from '@/store/types';
import { getAnimatedLine } from '@/engine/lineAnimation';
import { applyEasing } from '@/engine/easings';
import CalloutCard from './CalloutCard';

interface MapViewportProps {
  mapRef: React.MutableRefObject<MapRef | null>;
}

export default function MapViewport({ mapRef }: MapViewportProps) {
  const {
    mapStyle, terrainEnabled, buildingsEnabled, terrainExaggeration,
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
    if (mapStyle === 'satellite' || mapStyle === 'satelliteStreets') {
      return {
        'color': 'rgb(220, 159, 113)',
        'high-color': 'rgb(36, 92, 223)',
        'horizon-blend': 0.4,
        'space-color': 'rgb(11, 11, 25)',
        'star-intensity': 0.6,
      };
    } else if (mapStyle === 'dark') {
      return {
        'color': 'rgb(23, 23, 23)',       
        'high-color': 'rgb(10, 10, 40)',  
        'horizon-blend': 0.3,
        'space-color': 'rgb(5, 5, 15)',   
        'star-intensity': 0.8,
      };
    } else {
      return {
        'color': 'rgb(186, 210, 235)',
        'high-color': 'rgb(36, 92, 223)',
        'horizon-blend': 0.02,
        'space-color': 'rgb(11, 11, 25)',
        'star-intensity': 0.6,
      };
    }
  }, [mapStyle]);

  const terrainConfig = useMemo(() => {
    return terrainEnabled ? { source: 'mapbox-dem', exaggeration: terrainExaggeration } : undefined;
  }, [terrainEnabled, terrainExaggeration]);

  // Handle standard style 3D objects imperatively as it lacks a custom layer
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    
    const applyStandardConfig = () => {
      if (useProjectStore.getState().mapStyle === 'standard' && map.isStyleLoaded()) {
        try { map.setConfigProperty('basemap', 'show3dObjects', useProjectStore.getState().buildingsEnabled); } catch {}
      }
    };

    map.on('style.load', applyStandardConfig);
    applyStandardConfig();

    return () => {
      map.off('style.load', applyStandardConfig);
    };
  }, [buildingsEnabled, mapStyle]);

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
    <div className="flex-1 relative">
      <MapGL
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ longitude: -73.97, latitude: 40.77, zoom: 12, pitch: 0, bearing: 0 }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={styleUrl}
        onClick={handleMapClick}
        interactive={!isPlaying}
        preserveDrawingBuffer
        projection="globe"
        fog={fogConfig}
        terrain={terrainConfig}
      >
        {/* Declarative Data Sources and Environment */}
        {terrainEnabled && (
          <Source id="mapbox-dem" type="raster-dem" url="mapbox://mapbox.mapbox-terrain-dem-v1" tileSize={512} maxzoom={14} />
        )}

        {buildingsEnabled && mapStyle !== 'standard' && (
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

  const animatedData = React.useMemo(() => {
    if (coords.length < 2) return null;
    let t: number;
    if (playheadTime < route.startTime) t = 0;
    else if (playheadTime > route.endTime) t = 1;
    else t = (playheadTime - route.startTime) / (route.endTime - route.startTime);
    t = applyEasing(route.easing, t);
    const animCoords = getAnimatedLine(coords, t);
    if (animCoords.length < 2) return null;
    return { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: animCoords } };
  }, [coords, playheadTime, route.startTime, route.endTime, route.easing]);

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
  let t: number;
  if (playheadTime < boundary.startTime) t = 0;
  else if (playheadTime > boundary.endTime) t = 1;
  else t = (playheadTime - boundary.startTime) / (boundary.endTime - boundary.startTime);
  t = applyEasing(boundary.easing, t);
  const fillOpacity = boundary.style.fillOpacity * (t > 0.8 ? (t - 0.8) / 0.2 : 0) * (t > 0 ? 1 : 0);
  const geojsonData: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: boundary.geojson }] };

  return (
    <>
      <Source id={`boundary-fill-${boundary.id}`} type="geojson" data={geojsonData}>
        <Layer id={`boundary-fill-layer-${boundary.id}`} type="fill" paint={{ 'fill-color': boundary.style.fillColor, 'fill-opacity': fillOpacity }} />
      </Source>
      {t > 0 && (
        <Source id={`boundary-stroke-${boundary.id}`} type="geojson" data={geojsonData}>
          <Layer id={`boundary-stroke-layer-${boundary.id}`} type="line" paint={{ 'line-color': boundary.style.strokeColor, 'line-width': boundary.style.strokeWidth, 'line-opacity': Math.min(t * 2, 1) }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
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
      offset={[0, -altitudeOffset] as [number, number]}
    >
      <CalloutCard callout={callout} phase={phase} progress={animProgress} altitudeOffset={altitudeOffset} />
    </Marker>
  );
}

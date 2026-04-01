import React, { useRef, useEffect, useCallback, useState } from 'react';
import Map, { useMap, Source, Layer, Marker } from 'react-map-gl';
import type { MapRef } from 'react-map-gl';
import { MAPBOX_TOKEN, MAP_STYLES } from '@/config/mapbox';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import type { RouteItem, BoundaryItem, CalloutItem, CameraItem } from '@/store/types';
import { getAnimatedLine } from '@/engine/lineAnimation';
import { applyEasing } from '@/engine/easings';
import CalloutCard from './CalloutCard';

export default function MapViewport() {
  const mapRef = useRef<MapRef>(null);
  const {
    mapStyle, terrainEnabled, buildingsEnabled, terrainExaggeration,
    items, itemOrder, playheadTime, isPlaying,
    selectedItemId, updateItem, addCameraKeyframe, selectItem,
  } = useProjectStore();

  const styleUrl = MAP_STYLES[mapStyle]?.url || MAP_STYLES.streets.url;

  // Handle map click for callout placement
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

  // Terrain & buildings management
  const handleStyleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    if (terrainEnabled) {
      if (!map.getSource('mapbox-dem')) {
        map.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14,
        });
      }
      map.setTerrain({ source: 'mapbox-dem', exaggeration: terrainExaggeration });
    }

    if (buildingsEnabled && mapStyle !== 'standard') {
      if (!map.getLayer('3d-buildings')) {
        map.addLayer({
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': '#ddd',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.8,
          },
        });
      }
    }
  }, [terrainEnabled, buildingsEnabled, terrainExaggeration, mapStyle]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded()) return;

    if (terrainEnabled) {
      if (!map.getSource('mapbox-dem')) {
        map.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14,
        });
      }
      map.setTerrain({ source: 'mapbox-dem', exaggeration: terrainExaggeration });
    } else {
      map.setTerrain(null);
    }
  }, [terrainEnabled, terrainExaggeration]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded()) return;

    if (mapStyle === 'standard') {
      try {
        map.setConfigProperty('basemap', 'show3dObjects', buildingsEnabled);
      } catch {}
      return;
    }

    if (buildingsEnabled) {
      if (!map.getLayer('3d-buildings')) {
        try {
          map.addLayer({
            id: '3d-buildings',
            source: 'composite',
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 14,
            paint: {
              'fill-extrusion-color': '#ddd',
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'min_height'],
              'fill-extrusion-opacity': 0.8,
            },
          });
        } catch {}
      }
    } else {
      if (map.getLayer('3d-buildings')) {
        map.removeLayer('3d-buildings');
      }
    }
  }, [buildingsEnabled, mapStyle]);

  // Collect routes, boundaries, callouts for rendering
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
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{
          longitude: -73.97,
          latitude: 40.77,
          zoom: 12,
          pitch: 0,
          bearing: 0,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={styleUrl}
        onClick={handleMapClick}
        onLoad={handleStyleLoad}
        interactive={!isPlaying}
        projection={mapRef.current?.getMap()?.getZoom?.() ?? 12 < 5 ? { name: 'globe' } : undefined}
      >
        {/* Route layers */}
        {routes.map((route) => (
          <RouteLayerGroup key={route.id} route={route} playheadTime={playheadTime} />
        ))}

        {/* Boundary layers */}
        {boundaries.map((boundary) => (
          <BoundaryLayerGroup key={boundary.id} boundary={boundary} playheadTime={playheadTime} />
        ))}

        {/* Callout markers */}
        {callouts.map((callout) => (
          <CalloutMarker key={callout.id} callout={callout} playheadTime={playheadTime} />
        ))}
      </Map>
    </div>
  );
}

function RouteLayerGroup({ route, playheadTime }: { route: RouteItem; playheadTime: number }) {
  // Extract coordinates from geojson
  const coords = React.useMemo(() => {
    const allCoords: number[][] = [];
    for (const feature of route.geojson.features) {
      const geom = feature.geometry;
      if (geom.type === 'LineString') {
        allCoords.push(...(geom as any).coordinates);
      } else if (geom.type === 'MultiLineString') {
        for (const line of (geom as any).coordinates) {
          allCoords.push(...line);
        }
      }
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

    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: animCoords,
      },
    };
  }, [coords, playheadTime, route.startTime, route.endTime, route.easing]);

  if (!animatedData) return null;

  const geojsonData: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [animatedData],
  };

  return (
    <>
      {route.style.glow && (
        <Source id={`route-glow-${route.id}`} type="geojson" data={geojsonData}>
          <Layer
            id={`route-glow-layer-${route.id}`}
            type="line"
            paint={{
              'line-color': route.style.glowColor,
              'line-width': route.style.width * 3,
              'line-opacity': 0.35,
              'line-blur': route.style.width * 2,
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </Source>
      )}
      <Source id={`route-${route.id}`} type="geojson" data={geojsonData}>
        <Layer
          id={`route-layer-${route.id}`}
          type="line"
          paint={{
            'line-color': route.style.color,
            'line-width': route.style.width,
            'line-opacity': 1,
          }}
          layout={{
            'line-cap': 'round',
            'line-join': 'round',
          }}
        />
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

  const geojsonData: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: boundary.geojson }],
  };

  return (
    <>
      <Source id={`boundary-fill-${boundary.id}`} type="geojson" data={geojsonData}>
        <Layer
          id={`boundary-fill-layer-${boundary.id}`}
          type="fill"
          paint={{
            'fill-color': boundary.style.fillColor,
            'fill-opacity': fillOpacity,
          }}
        />
      </Source>
      {t > 0 && (
        <Source id={`boundary-stroke-${boundary.id}`} type="geojson" data={geojsonData}>
          <Layer
            id={`boundary-stroke-layer-${boundary.id}`}
            type="line"
            paint={{
              'line-color': boundary.style.strokeColor,
              'line-width': boundary.style.strokeWidth,
              'line-opacity': Math.min(t * 2, 1),
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </Source>
      )}
    </>
  );
}

function CalloutMarker({ callout, playheadTime }: { callout: CalloutItem; playheadTime: number }) {
  if (callout.lngLat[0] === 0 && callout.lngLat[1] === 0) return null;
  if (playheadTime < callout.startTime || playheadTime > callout.endTime) return null;

  const enterEnd = callout.startTime + callout.animation.enterDuration;
  const exitStart = callout.endTime - callout.animation.exitDuration;

  let phase: 'enter' | 'visible' | 'exit' = 'visible';
  let animProgress = 1;

  if (playheadTime < enterEnd) {
    phase = 'enter';
    animProgress = (playheadTime - callout.startTime) / callout.animation.enterDuration;
  } else if (playheadTime > exitStart) {
    phase = 'exit';
    animProgress = (playheadTime - exitStart) / callout.animation.exitDuration;
  }

  return (
    <Marker longitude={callout.lngLat[0]} latitude={callout.lngLat[1]} anchor={callout.anchor}>
      <CalloutCard callout={callout} phase={phase} progress={animProgress} />
    </Marker>
  );
}

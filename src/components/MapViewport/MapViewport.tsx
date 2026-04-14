import React, { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import MapGL, { Layer } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import { getEffectiveMapboxToken, MAP_STYLES } from '@/config/mapbox';

import { useProjectStore } from '@/store/useProjectStore';
import type { RouteItem, BoundaryItem, CalloutItem } from '@/store/types';
import { PreviewRouteLayer } from './PreviewRouteLayer';
import { toast } from 'sonner';
import { PreviewBoundaryLayer } from './PreviewBoundaryLayer';

import { resolveClickTarget, applyPickResult } from './mapUtils';
import { RouteLayerGroup } from './RouteLayerGroup';
import { BoundaryLayerGroup } from './BoundaryLayerGroup';
import { CalloutMarker } from './CalloutMarker';
import { useMapSync } from './hooks/useMapSync';
import { useCalloutAnimationState } from './hooks/useCalloutAnimationState';
import { useCalloutAltitudeOffsets } from './hooks/useCalloutAltitudeOffsets';

interface CalloutMarkerListProps {
  callouts: CalloutItem[];
  selectedCalloutId: string | null;
  mapRef: React.MutableRefObject<MapRef | null>;
}

function CalloutMarkerList({ callouts, selectedCalloutId, mapRef }: CalloutMarkerListProps) {
  const playheadTime = useProjectStore((s) => s.playheadTime);
  const isMoveModeActive = useProjectStore((s) => s.isMoveModeActive);

  const calloutAnimationStates = useCalloutAnimationState(
    playheadTime,
    isMoveModeActive,
    selectedCalloutId,
    callouts
  );

  const calloutAltitudeOffsets = useCalloutAltitudeOffsets(mapRef, callouts);

  return (
    <>
      {callouts.map((callout) => {
        const animState = calloutAnimationStates[callout.id];
        return (
          <CalloutMarker
            key={callout.id}
            callout={callout}
            mapRef={mapRef}
            isSelected={selectedCalloutId === callout.id}
            isVisible={animState.isVisible}
            phase={animState.phase}
            progress={animState.progress}
            altitudeOffset={calloutAltitudeOffsets[callout.id] ?? 0}
          />
        );
      })}
    </>
  );
}

interface MapViewportProps {
  mapRef: React.MutableRefObject<MapRef | null>;
  onMapReady?: () => void;
}

export default function MapViewport({ mapRef, onMapReady }: MapViewportProps) {
  const mapStyle = useProjectStore((s) => s.mapStyle);
  const items = useProjectStore((s) => s.items);
  const itemOrder = useProjectStore((s) => s.itemOrder);
  const selectedItemId = useProjectStore((s) => s.selectedItemId);
  const updateItem = useProjectStore((s) => s.updateItem);
  const setMapCenter = useProjectStore((s) => s.setMapCenter);
  const isExporting = useProjectStore((s) => s.isExporting);

  const styleUrl = MAP_STYLES[mapStyle]?.url || MAP_STYLES.streets.url;

  // --- Style-loaded gate: prevents Source/Layer from mounting during style transitions ---
  const [styleLoaded, setStyleLoaded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const prevStyleRef = useRef(styleUrl);

  // Clear the gate whenever the style URL changes (user switched map style)
  useEffect(() => {
    if (prevStyleRef.current !== styleUrl) {
      prevStyleRef.current = styleUrl;
      setStyleLoaded(false);
    }
  }, [styleUrl]);

  // Called by <MapGL onLoad> — the map instance is now available
  const handleMapLoad = useCallback(() => {
    setMapReady(true);
    setStyleLoaded(true);
    onMapReady?.();
  }, [onMapReady]);

  const handleMapClick = useCallback((e: any) => {
    const s = useProjectStore.getState();
    const selectedId = s.selectedItemId;
    const editingPoint = s.editingRoutePoint;

    if (!editingPoint) {
      if (selectedId) {
        const item = s.items[selectedId];
        if (item?.kind === 'callout' && (item as CalloutItem).lngLat[0] === 0 && (item as CalloutItem).lngLat[1] === 0) {
          updateItem(selectedId, { lngLat: [e.lngLat.lng, e.lngLat.lat] } as any);
        }
      }
      return;
    }

    const target = resolveClickTarget(e, editingPoint);
    applyPickResult(s, editingPoint, target, updateItem);

    s.setEditingRoutePoint(null);
    s.setEditingItemId(null);
    const label = editingPoint === 'callout' ? 'Callout' : (editingPoint === 'start' ? 'Start' : 'End');
    toast.success(`${label} point set`);
  }, [updateItem]);

  // --- Imperative Sync Engine ---
  useMapSync(mapRef, mapReady, styleLoaded, setStyleLoaded);

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

  // Debounced map center update to prevent store churn during continuous panning
  const debouncedSetMapCenter = useMemo(() => {
    let timer: NodeJS.Timeout;
    return (lng: number, lat: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setMapCenter([lng, lat]);
      }, 100);
    };
  }, [setMapCenter]);

  const selectedCalloutId = selectedItemId && items[selectedItemId]?.kind === 'callout' ? selectedItemId : null;

  return (
    <div className="w-full h-full relative">
      <MapGL
        ref={mapRef}
        mapboxAccessToken={getEffectiveMapboxToken()}
        initialViewState={{ longitude: -73.97, latitude: 40.77, zoom: 12, pitch: 0, bearing: 0 }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={styleUrl}
        onClick={handleMapClick}
        onLoad={handleMapLoad}
        onMove={(evt) => debouncedSetMapCenter(evt.viewState.longitude, evt.viewState.latitude)}
        interactiveLayerIds={["search-results-circles"]}
        preserveDrawingBuffer={true}
      >
        {/* Gate all sources/layers behind styleLoaded to prevent "Style is not done loading" crash */}
        {styleLoaded && (
          <>
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

            {/* Previews */}
            <PreviewRouteLayer />
            <PreviewBoundaryLayer />

            {/* Project Items — imperative managers, render null themselves */}
            {routes.map((route) => (
              <RouteLayerGroup key={route.id} route={route} mapRef={mapRef} styleLoaded={styleLoaded} />
            ))}
            {boundaries.map((boundary) => (
              <BoundaryLayerGroup key={boundary.id} boundary={boundary} mapRef={mapRef} styleLoaded={styleLoaded} />
            ))}
          </>
        )}

        {/* Callouts use Markers (DOM elements) — safe outside the styleLoaded gate.
            CalloutMarkerList owns playheadTime so MapViewport never re-renders during playback. */}
        <CalloutMarkerList
          callouts={callouts}
          selectedCalloutId={selectedCalloutId}
          mapRef={mapRef}
        />
      </MapGL>
    </div>
  );
}

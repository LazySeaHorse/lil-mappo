import React, { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import MapGL, { Layer } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import type { MapLayerMouseEvent } from 'mapbox-gl';
import { MAP_STYLES } from '@/config/mapbox';

import { useProjectStore } from '@/store/useProjectStore';
import type { CalloutItem } from '@/store/types';
import { PreviewRouteLayer } from './PreviewRouteLayer';
import { toast } from 'sonner';
import { PreviewBoundaryLayer } from './PreviewBoundaryLayer';

import { resolveClickTarget } from './mapUtils';
import { CalloutMarker } from './CalloutMarker';
import type { MapSceneRuntimeRef } from '@/hooks/useMapRuntime';
import { MapSceneController } from './runtime/MapSceneController';
import { useCalloutAnimationState } from './hooks/useCalloutAnimationState';
import { useCalloutAltitudeOffsets } from './hooks/useCalloutAltitudeOffsets';
import type { MapGesture } from '@/components/Onboarding/walkthroughState';

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
  runtimeRef: MapSceneRuntimeRef;
  onMapReady?: () => void;
  onMapGesture?: (gesture: MapGesture) => void;
  mapboxToken: string;
}

export default function MapViewport({ mapRef, runtimeRef, onMapReady, onMapGesture, mapboxToken }: MapViewportProps) {
  const mapStyle = useProjectStore((s) => s.mapStyle);
  const items = useProjectStore((s) => s.items);
  const itemOrder = useProjectStore((s) => s.itemOrder);
  const selectedItemId = useProjectStore((s) => s.selectedItemId);
  const updateItem = useProjectStore((s) => s.updateItem);
  const setMapCenter = useProjectStore((s) => s.setMapCenter);

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

  const handleMapClick = useCallback((e: MapLayerMouseEvent) => {
    const s = useProjectStore.getState();
    const activePicker = s.activePicker;

    if (activePicker) {
      const target = resolveClickTarget(e, activePicker.prompt || 'Point');
      activePicker.onPick(target);
      s.stopPicking();
      const label = activePicker.prompt || 'Point';
      toast.success(`${label} point set`);
      return;
    }

    const selectedId = s.selectedItemId;
    if (selectedId) {
      const item = s.items[selectedId];
      if (item?.kind === 'callout' && item.lngLat[0] === 0 && item.lngLat[1] === 0) {
        updateItem(selectedId, { lngLat: [e.lngLat.lng, e.lngLat.lat] });
      }
    }
  }, [updateItem]);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    const runtime = new MapSceneController(map, setStyleLoaded);
    runtimeRef.current = runtime;
    runtime.mount();

    return () => {
      runtime.dispose();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, [mapReady, mapRef, runtimeRef]);

  const callouts: CalloutItem[] = [];

  for (const id of itemOrder) {
    const item = items[id];
    if (!item) continue;
    if (item.kind === 'callout') callouts.push(item);
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
    <div className="w-full h-full relative" data-walkthrough="map-viewport">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-20 h-px w-px"
        data-walkthrough="map-coachmark-anchor"
      />
      <MapGL
        ref={mapRef}
        mapboxAccessToken={mapboxToken}
        RTLTextPlugin={false}
        initialViewState={{ longitude: -73.97, latitude: 40.77, zoom: 12, pitch: 0, bearing: 0 }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={styleUrl}
        onClick={handleMapClick}
        onLoad={handleMapLoad}
        onMove={(evt) => debouncedSetMapCenter(evt.viewState.longitude, evt.viewState.latitude)}
        onDragEnd={() => onMapGesture?.('pan')}
        onRotateEnd={() => onMapGesture?.('orbit')}
        onPitchEnd={() => onMapGesture?.('orbit')}
        onZoomEnd={() => onMapGesture?.('zoom')}
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

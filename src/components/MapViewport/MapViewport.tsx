import React, { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import MapGL from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import type { MapLayerMouseEvent } from 'mapbox-gl';
import { MAP_STYLES, transformMapboxRequest } from '@/config/mapbox';

import { useProjectStore } from '@/store/useProjectStore';
import { getProjectCameraAt, hasMapCenter, syncMapToProject } from '@/engine/cameraUtils';
import { PreviewRouteLayer } from './PreviewRouteLayer';
import { toast } from 'sonner';
import { PreviewBoundaryLayer } from './PreviewBoundaryLayer';

import { resolveClickTarget } from './mapUtils';
import { AnnotationLayer } from '@/annotations/preview/AnnotationLayer';
import { RouteWaypointMarkers, DraftWalkMarkers } from './RouteWaypointMarkers';
import { DraftWalkLayer } from './DraftWalkLayer';
import { SelectionPreviewPill } from './SelectionPreviewPill';
import { handleEscapeKey } from './escapeDeselect';
import type { MapSceneRuntimeRef } from '@/hooks/useMapRuntime';
import { MapSceneController } from './runtime/MapSceneController';
import type { MapGesture } from '@/components/Onboarding/walkthroughState';


interface MapViewportProps {
  mapRef: React.MutableRefObject<MapRef | null>;
  runtimeRef: MapSceneRuntimeRef;
  onMapReady?: () => void;
  onMapGesture?: (gesture: MapGesture) => void;
  mapboxToken: string;
}

export default function MapViewport({ mapRef, runtimeRef, onMapReady, onMapGesture, mapboxToken }: MapViewportProps) {
  const mapStyle = useProjectStore((s) => s.mapStyle);
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

  // Called by <MapGL onLoad> — the map instance is now available. The controller's
  // style.load handler (also run on mount for an already-loaded style) sets styleLoaded.
  const handleMapLoad = useCallback(() => {
    setMapReady(true);
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
      if (item?.kind === 'callout' && item.binding.kind === 'geographic' && item.binding.lngLat[0] === 0 && item.binding.lngLat[1] === 0) {
        updateItem(selectedId, { binding: { kind: 'geographic', lngLat: [e.lngLat.lng, e.lngLat.lat], altitude: 0 } });
      }
    }
  }, [updateItem]);

  useEffect(() => {
    window.addEventListener('keydown', handleEscapeKey);
    return () => window.removeEventListener('keydown', handleEscapeKey);
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    if (import.meta.env.DEV) {
      (window as unknown as { __mapInstance?: typeof map }).__mapInstance = map;
    }

    syncMapToProject(map, useProjectStore.getState().playheadTime);

    const runtime = new MapSceneController(map, setStyleLoaded);
    runtimeRef.current = runtime;
    runtime.mount();

    return () => {
      if (typeof window !== 'undefined' && (window as unknown as { __mapInstance?: unknown }).__mapInstance === map) {
        delete (window as unknown as { __mapInstance?: unknown }).__mapInstance;
      }
      runtime.dispose();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, [mapReady, mapRef, runtimeRef]);

  // Start close to where syncMapToProject will put the map, to avoid a visible jump.
  const initialViewState = useMemo(() => {
    const { playheadTime, mapCenter } = useProjectStore.getState();
    const cam = getProjectCameraAt(playheadTime);
    if (cam?.type === 'jumpTo') {
      const [longitude, latitude] = cam.center;
      return { longitude, latitude, zoom: cam.zoom, pitch: cam.pitch, bearing: cam.bearing };
    }
    const [longitude, latitude] = hasMapCenter(mapCenter) ? mapCenter : [-73.97, 40.77];
    return { longitude, latitude, zoom: 12, pitch: 0, bearing: 0 };
  }, []);

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
        transformRequest={transformMapboxRequest}
        RTLTextPlugin={false}
        attributionControl={false}
        styleDiffing={false}
        initialViewState={initialViewState}
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
            {/* Previews */}
            <PreviewRouteLayer />
            <DraftWalkLayer />
            <PreviewBoundaryLayer />

          </>
        )}

        {/* Callouts draw on their own overlay canvas, so they are safe outside the styleLoaded gate.
            AnnotationLayer reads the store itself so MapViewport never re-renders during playback. */}
        <AnnotationLayer />
        <RouteWaypointMarkers />
        <DraftWalkMarkers />
      </MapGL>
      <SelectionPreviewPill />
    </div>
  );
}

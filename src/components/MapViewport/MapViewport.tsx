import React, { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import MapGL, { Source, Layer, Marker } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import type { GeoJSONSource } from 'mapbox-gl';
import { MAPBOX_TOKEN, MAP_STYLES, type MapStyleCapabilities } from '@/config/mapbox';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import type { RouteItem, BoundaryItem, CalloutItem, CameraItem } from '@/store/types';
import { getNormalizedProgress } from '@/engine/easings';
import CalloutCard from './CalloutCard';
import { extractLineStringsFromGeometry } from '@/engine/geoUtils';
import { getLineSegment, getAnimatedLine } from '@/engine/lineAnimation';
import { PreviewRouteLayer } from './PreviewRouteLayer';
import { toast } from 'sonner';
import { VehicleModelLayer } from './VehicleModelLayer';
import { PreviewBoundaryLayer } from './PreviewBoundaryLayer';




interface MapViewportProps {
  mapRef: React.MutableRefObject<MapRef | null>;
}

/**
 * Detects capabilities for any Mapbox style by scanning the loaded style's label layer IDs.
 * Dynamically creates label groups from actual layers, formatting names for display.
 * For Standard style (which uses Config API instead of layers), returns predefined groups.
 * Works for built-in and custom styles.
 */
function detectRuntimeCapabilities(map: any): MapStyleCapabilities {
  const s = useProjectStore.getState();

  // Standard style uses Config API, not traditional label layers
  if (s.mapStyle === 'standard') {
    return {
      labelGroups: [
        { id: 'place', label: 'Place Names', layerPatterns: ['country-label', 'state-label', 'settlement-major-label', 'settlement-minor-label', 'settlement-subdivision-label', 'continent-label'] },
        { id: 'admin', label: 'Country & State Borders', layerPatterns: ['admin'] },
        { id: 'road', label: 'Road Labels', layerPatterns: ['road-label', 'road-number-shield'] },
        { id: 'transit', label: 'Transit', layerPatterns: ['transit-label'] },
        { id: 'poi', label: 'Points of Interest', layerPatterns: ['poi-label'] },
        { id: 'water', label: 'Water Names', layerPatterns: ['water-point-label', 'water-line-label'] },
        { id: 'natural', label: 'Natural Features', layerPatterns: ['natural-point-label', 'natural-line-label'] },
        { id: 'building', label: 'Building Names', layerPatterns: ['building-number-label'] },
      ],
      landmarks3d: true,
      trees3d: true,
      facades3d: true,
      timeOfDayPreset: true,
      colorCustomization: false,
    };
  }

  // For other styles, detect from actual label layers
  const layers = map.getStyle()?.layers ?? [];
  const labelLayers = layers.filter((l: any) => {
    const id = l.id.toLowerCase();
    return id.includes('label') || id.includes('shield');
  });

  // Format layer ID to human-readable label
  // e.g., "settlement-subdivision-label" → "Settlement Subdivision"
  const formatLayerName = (layerId: string): string => {
    return layerId
      .toLowerCase()
      .replace(/-label$/, '') // Remove trailing "-label"
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const detectedLabelGroups = labelLayers.map((layer: any) => ({
    id: layer.id.toLowerCase().replace(/-label$/, ''), // Use formatted ID without "-label"
    label: formatLayerName(layer.id),
    layerPatterns: [layer.id], // Each group targets exactly its layer
  }));

  return {
    labelGroups: detectedLabelGroups,
    landmarks3d: false,
    trees3d: false,
    facades3d: false,
    timeOfDayPreset: false,
    colorCustomization: true,
  };
}

function resolveClickTarget(e: any, editingPoint: string): { lngLat: [number, number]; name: string } {
  const searchFeature = e.features?.find((f: any) => f.layer.id === 'search-results-circles');
  if (searchFeature) {
    return {
      lngLat: searchFeature.geometry.coordinates as [number, number],
      name: searchFeature.properties.name?.split(',')[0] || (editingPoint === 'start' ? 'Start' : 'End'),
    };
  }
  const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
  return { lngLat, name: `${lngLat[0].toFixed(4)}, ${lngLat[1].toFixed(4)}` };
}

function applyPickResult(
  s: ReturnType<typeof useProjectStore.getState>,
  editingPoint: string,
  target: { lngLat: [number, number]; name: string },
  updateItem: (id: string, patch: any) => void,
) {
  const { lngLat, name } = target;

  if (editingPoint === 'callout') {
    const editingId = s.editingItemId;
    if (editingId) {
      const item = s.items[editingId] as CalloutItem;
      if (item) {
        const updates: Partial<CalloutItem> = { lngLat };
        if (item.linkTitleToLocation) updates.title = name;
        updateItem(editingId, updates as any);
      }
    } else {
      s.setDraftCallout({ lngLat, name });
    }
  } else if (s.editingItemId) {
    const routeItem = s.items[s.editingItemId] as RouteItem;
    if (routeItem) {
      const calc = routeItem.calculation || { mode: 'manual', startPoint: [0, 0], endPoint: [0, 0] };
      updateItem(s.editingItemId, { calculation: { ...calc, [editingPoint === 'start' ? 'startPoint' : 'endPoint']: lngLat } } as any);
    }
  } else {
    if (editingPoint === 'start') s.setDraftStart({ lngLat, name });
    else s.setDraftEnd({ lngLat, name });
  }
}

export default function MapViewport({ mapRef }: MapViewportProps) {
  // playheadTime and isPlaying are intentionally removed from this destructure.
  // RouteLayerGroup/BoundaryLayerGroup subscribe imperatively.
  // CalloutMarker self-subscribes to playheadTime.
  const {
    mapStyle, terrainEnabled, buildingsEnabled, terrainExaggeration,
    projection, lightPreset, labelVisibility,
    show3dLandmarks, show3dTrees, show3dFacades, starIntensity, fogColor,
    items, itemOrder,
    selectedItemId, updateItem, selectItem, isMoveModeActive,
    setMapCenter, terrainLoading, buildingsLoading, isExporting,
  } = useProjectStore();

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
  }, []);

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

  // --- Stable ref for the sync function so event listeners always call the latest version ---
  const syncRef = useRef<() => void>(() => {});

  /**
   * Helper: Unified visibility toggler for both Standard Configs and Legacy Layers
   */
  const toggleFeature = useCallback((map: any, pkg: string, prop: string, layerIdPatterns: string | string[], visible: boolean) => {
    const s = useProjectStore.getState();

    // 1. Try Mapbox v3 Standard Config (maps label group IDs to config property names)
    if (s.mapStyle === 'standard') {
      try {
        // Map label group IDs to standard style config property names
        const configPropMap: Record<string, string> = {
          'place': 'showPlaceLabels',
          'admin': 'showAdminBoundaries',
          'road': 'showRoadLabels',
          'poi': 'showPointOfInterestLabels',
          'transit': 'showTransitLabels',
          // water/natural/building have no Config API toggle — handled by layer fallback below
        };
        const configProp = configPropMap[prop];
        if (configProp && map.getConfigProperty(pkg, configProp) !== visible) {
          map.setConfigProperty(pkg, configProp, visible);
        }
      } catch (e) {}
    }

    // 2. Always check Legacy Layers (essential for non-Standard styles)
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

  /**
   * Keep the sync ref always pointing to the latest sync logic.
   * This runs on every render but is cheap — it just assigns a closure.
   */
  syncRef.current = () => {
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded()) return;
    const s = useProjectStore.getState();

    try {
      // 1. PROJECTION (Top priority - establishes coordinate space)
      if (map.getProjection().name !== s.projection) {
        map.setProjection({ name: s.projection });
      }

      // 2. 3D BUILDINGS & STANDARD CONFIG
      // Standard style light presets reset atmosphere, so we must sync this BEFORE setFog
      const buildingsOn = s.buildingsEnabled;
      
      if (s.mapStyle === 'standard') {
        // Only set light preset if it actually changed to avoid atmosphere flickering
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

      // 3. LABELS (Dynamic label groups detected from the loaded style)
      if (s.detectedCapabilities) {
        s.detectedCapabilities.labelGroups.forEach((group) => {
          const isVisible = s.labelVisibility[group.id] ?? true;
          toggleFeature(map, 'basemap', group.id, group.layerPatterns, isVisible);
        });
      }

      // 4. TERRAIN (Imperative DEM management)
      if (s.terrainEnabled) {
        if (!map.getSource('mapbox-dem')) {
          map.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512,
            maxzoom: 14
          });
        }
        
        const currentTerrain = map.getTerrain();
        if (!currentTerrain || currentTerrain.source !== 'mapbox-dem' || currentTerrain.exaggeration !== s.terrainExaggeration) {
          map.setTerrain({ source: 'mapbox-dem', exaggeration: s.terrainExaggeration });
        }
      } else if (map.getTerrain()) {
        map.setTerrain(null);
      }

      // 5. ATMOSPHERE / FOG (FINAL PASS - Overwrites any style/preset defaults)
      // This is where stars and groundfog are applied. We compare target vs current to avoid loop flicker.
      const targetFog = fogConfig as any;
      const currentFog = map.getFog();
      
      const needsFogSync = !currentFog || 
        currentFog.color !== targetFog.color || 
        currentFog['star-intensity'] !== targetFog['star-intensity'] ||
        currentFog['space-color'] !== targetFog['space-color'];

      if (needsFogSync) {
        map.setFog(targetFog);
      }

    } catch (err) {
      console.warn('Sync engine failure (async transition):', err);
    }
  };

  /**
   * Mount-once Effect: Registers Mapbox event listeners once the map is ready.
   * Uses syncRef so the callback always invokes the latest sync logic
   * without needing to tear down and re-register listeners.
   */
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    const handleStyleLoad = () => {
      setStyleLoaded(true);
      const s = useProjectStore.getState();

      // Detect capabilities for all styles (built-in and custom)
      const detected = detectRuntimeCapabilities(map);
      s.setDetectedCapabilities(detected);


      syncRef.current();
    };
    const handleStyleImportData = () => syncRef.current();
    const handleSourceData = (e: any) => {
      // Re-sync on any DEM source event to catch terrain readiness
      if (e.sourceId === 'mapbox-dem') {
        syncRef.current();
        
        // Skip loading spinner updates during playback to prevent flicker and save cycles
        const s = useProjectStore.getState();
        if (s.isPlaying || !s.terrainEnabled) return;

        // Defer the state update to the next frame to avoid React lifecycle clashes
        // (Mapbox events often fire synchronously during a child component's mount)
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
      // Final "Validation Pass" - ensures projection/fog stick after transitions finish
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

    // Attach current sync logic to the map instance for the Export Engine to call
    (map as any)._syncRef = syncRef;

    // Sync immediately — style is already loaded from onLoad
    syncRef.current();

    // Imperatively toggle map interaction handlers when playback starts/stops.
    // This avoids passing isPlaying as a reactive React prop to <MapGL>, which would
    // cause a MapViewport re-render at exactly the moment the RAF loop fires jumpTo(),
    // creating a race condition inside Mapbox's matrix calculations.
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  /**
   * Reactive Sync Effect: Fires syncEverything whenever any store value changes.
   * The mount-once effect handles event-driven retries; this handles direct state changes.
   * Includes terrainLoading/buildingsLoading so that once async operations finish,
   * a final sync runs to catch any toggle changes that occurred during loading.
   */
  const detectedCapabilities = useProjectStore((s) => s.detectedCapabilities);

  useEffect(() => {
    syncRef.current();
  }, [
    mapStyle, projection, terrainEnabled, terrainExaggeration, fogConfig,
    buildingsEnabled, lightPreset, labelVisibility, show3dLandmarks,
    show3dTrees, show3dFacades, styleLoaded, terrainLoading, buildingsLoading,
    detectedCapabilities
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
    <div className="w-full h-full relative">
      <MapGL
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ longitude: -73.97, latitude: 40.77, zoom: 12, pitch: 0, bearing: 0 }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={styleUrl}
        onClick={handleMapClick}
        onLoad={handleMapLoad}
        onMove={(evt) => debouncedSetMapCenter(evt.viewState.longitude, evt.viewState.latitude)}
        interactiveLayerIds={["search-results-circles"]}
        preserveDrawingBuffer={isExporting}
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
            All callouts are always rendered; each CalloutMarker self-subscribes to
            playheadTime and returns null when outside its time range. */}
        {callouts.map((callout) => (
          <CalloutMarker
            key={callout.id}
            callout={callout}
            mapRef={mapRef}
            isSelected={selectedItemId === callout.id}
          />
        ))}
      </MapGL>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RouteLayerGroup — imperative manager, renders null
// Adds sources/layers on mount, calls setData() on every playhead change.
// ---------------------------------------------------------------------------

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

function RouteLayerGroup({
  route,
  mapRef,
  styleLoaded,
}: {
  route: RouteItem;
  mapRef: React.MutableRefObject<MapRef | null>;
  styleLoaded: boolean;
}) {
  // Pre-compute the flat coords array — only recalculated when route.geojson changes
  const coords = React.useMemo(() => {
    const allCoords: number[][] = [];
    for (const feature of route.geojson.features) {
      const geom = feature.geometry;
      if (geom.type === 'LineString') allCoords.push(...(geom as any).coordinates);
      else if (geom.type === 'MultiLineString') for (const line of (geom as any).coordinates) allCoords.push(...line);
    }
    return allCoords;
  }, [route.geojson]);

  const coordsRef = useRef(coords);
  coordsRef.current = coords;

  const routeRef = useRef(route);
  routeRef.current = route;

  const mapRefRef = useRef(mapRef);
  mapRefRef.current = mapRef;

  // Mount effect: add sources + layers imperatively, subscribe to playhead, clean up on unmount
  useEffect(() => {
    if (!styleLoaded) return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    const mainId = `route-${route.id}`;
    const mainLayerId = `route-layer-${route.id}`;
    const glowId = `route-glow-${route.id}`;
    const glowLayerId = `route-glow-layer-${route.id}`;

    // Add main source
    if (!map.getSource(mainId)) {
      map.addSource(mainId, { type: 'geojson', data: EMPTY_FC });
    }
    // Add glow source (always add; layer rendered conditionally)
    if (!map.getSource(glowId)) {
      map.addSource(glowId, { type: 'geojson', data: EMPTY_FC });
    }

    // Add main line layer
    if (!map.getLayer(mainLayerId)) {
      map.addLayer({
        id: mainLayerId,
        type: 'line',
        source: mainId,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': routeRef.current.calculation?.mode === 'flight' ? '#f59e0b' : routeRef.current.style.color,
          'line-width': routeRef.current.style.width,
          'line-opacity': 1,
        },
      });
    }

    // `destroyed` flag prevents callbacks running after cleanup (in-flight race protection).
    let destroyed = false;

    // Named update function — extracted so it can be called immediately as an initial pump.
    // useProjectStore.subscribe() only fires on *future* changes; without the initial call
    // the sources stay empty (EMPTY_FC) until the next state mutation.
    const updateRoute = (state: ReturnType<typeof useProjectStore.getState>) => {
      if (destroyed) return;
      const r = routeRef.current;
      const c = coordsRef.current;
      const m = mapRefRef.current.current?.getMap();
      if (!m) return;

      // Guard on our specific source rather than isStyleLoaded().
      // isStyleLoaded() returns false during Standard style's async import loading,
      // which would silently block every callback until the user interacts.
      const mainSource = m.getSource(mainId) as GeoJSONSource | undefined;
      if (!mainSource) return;

      if (c.length < 2) {
        // No valid geometry — keep source empty
        mainSource.setData(EMPTY_FC);
        return;
      }

      const isFlight = r.calculation?.mode === 'flight';
      const progress = getNormalizedProgress(state.playheadTime, r.startTime, r.endTime, r.easing);
      const animCoords = getAnimatedLine(c, progress);

      // Build the feature collection — EMPTY_FC when progress=0 (route not yet started).
      // Always call setData so the source is kept in sync; opacity/data together control visibility.
      const fc: GeoJSON.FeatureCollection = animCoords.length >= 2
        ? {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: animCoords },
            }],
          }
        : EMPTY_FC;

      // Update paint properties in case Inspector values changed
      try {
        m.setPaintProperty(mainLayerId, 'line-color', isFlight ? '#f59e0b' : r.style.color);
        m.setPaintProperty(mainLayerId, 'line-width', r.style.width);
      } catch (_) {}

      mainSource.setData(fc);

      // Glow layer — same pattern
      const glowSource = m.getSource(glowId) as GeoJSONSource | undefined;
      if (r.style.glow && glowSource) {
        if (!m.getLayer(glowLayerId)) {
          try {
            m.addLayer(
              {
                id: glowLayerId,
                type: 'line',
                source: glowId,
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: {
                  'line-color': isFlight ? '#fbbf24' : r.style.glowColor,
                  'line-width': r.style.width * 3,
                  'line-opacity': 0.35,
                  'line-blur': r.style.width * 2,
                },
              },
              mainLayerId,
            );
          } catch (_) {}
        } else {
          try {
            m.setPaintProperty(glowLayerId, 'line-color', isFlight ? '#fbbf24' : r.style.glowColor);
            m.setPaintProperty(glowLayerId, 'line-width', r.style.width * 3);
            m.setPaintProperty(glowLayerId, 'line-blur', r.style.width * 2);
          } catch (_) {}
        }
        glowSource.setData(fc);
      } else if (m.getLayer(glowLayerId)) {
        try { m.removeLayer(glowLayerId); } catch (_) {}
      }
    };

    const unsub = useProjectStore.subscribe(updateRoute);
    // Initial pump: populate layers immediately with the current state
    updateRoute(useProjectStore.getState());

    return () => {
      destroyed = true;
      unsub();
      const m = mapRefRef.current.current?.getMap();
      if (!m) return;
      // Clean up layers then sources
      if (m.getLayer(glowLayerId)) try { m.removeLayer(glowLayerId); } catch (_) {}
      if (m.getLayer(mainLayerId)) try { m.removeLayer(mainLayerId); } catch (_) {}
      if (m.getSource(glowId)) try { m.removeSource(glowId); } catch (_) {}
      if (m.getSource(mainId)) try { m.removeSource(mainId); } catch (_) {}
    };
  // Re-run only when style reloads or the route ID changes (not on every route prop change)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleLoaded, route.id]);

  // Render VehicleModelLayer as a React child (it needs its own lifecycle)
  if (route.calculation?.vehicle?.enabled) {
    // VehicleModelLayer needs current animated coords — subscribe locally
    return <VehicleAnimatedLayer route={route} coords={coords} />;
  }

  return null;
}

/**
 * Thin wrapper that self-subscribes to playheadTime to feed VehicleModelLayer.
 * Only re-renders when route or coords change (not every frame).
 */
function VehicleAnimatedLayer({ route, coords }: { route: RouteItem; coords: number[][] }) {
  const playheadTime = useProjectStore((s) => s.playheadTime);
  const progress = getNormalizedProgress(playheadTime, route.startTime, route.endTime, route.easing);
  const animCoords = coords.length >= 2 ? getAnimatedLine(coords, progress) : [];

  if (animCoords.length < 2 || !route.calculation?.vehicle?.enabled) return null;
  return (
    <VehicleModelLayer
      routeId={route.id}
      coords={animCoords}
      vehicle={route.calculation.vehicle!}
    />
  );
}

// ---------------------------------------------------------------------------
// BoundaryLayerGroup — imperative manager, renders null
// ---------------------------------------------------------------------------

function BoundaryLayerGroup({
  boundary,
  mapRef,
  styleLoaded,
}: {
  boundary: BoundaryItem;
  mapRef: React.MutableRefObject<MapRef | null>;
  styleLoaded: boolean;
}) {
  const boundaryRef = useRef(boundary);
  boundaryRef.current = boundary;

  const mapRefRef = useRef(mapRef);
  mapRefRef.current = mapRef;

  useEffect(() => {
    if (!styleLoaded) return;
    if (!boundary.geojson || boundary.resolveStatus !== 'resolved') return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    const fillSourceId = `boundary-fill-${boundary.id}`;
    const fillLayerId = `boundary-fill-layer-${boundary.id}`;
    const strokeSourceId = `boundary-stroke-${boundary.id}`;
    const strokeLayerId = `boundary-stroke-layer-${boundary.id}`;

    // Add fill source + layer
    if (!map.getSource(fillSourceId)) {
      map.addSource(fillSourceId, { type: 'geojson', data: EMPTY_FC });
    }
    if (!map.getLayer(fillLayerId)) {
      const b = boundaryRef.current;
      map.addLayer({
        id: fillLayerId,
        type: 'fill',
        source: fillSourceId,
        paint: {
          'fill-color': b.style.fillColor,
          'fill-opacity': 0,
        },
      });
    }

    // Add stroke source + layer
    if (!map.getSource(strokeSourceId)) {
      map.addSource(strokeSourceId, { type: 'geojson', data: EMPTY_FC });
    }
    if (!map.getLayer(strokeLayerId)) {
      const b = boundaryRef.current;
      map.addLayer({
        id: strokeLayerId,
        type: 'line',
        source: strokeSourceId,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': b.style.strokeColor,
          'line-width': b.style.strokeWidth,
          'line-opacity': 0,
        },
      });
    }

    // `destroyed` flag prevents callbacks running after cleanup (in-flight race protection).
    let destroyed = false;

    // Named update function — extracted so it can be called immediately as an initial pump.
    const updateBoundary = (state: ReturnType<typeof useProjectStore.getState>) => {
      if (destroyed) return;
      const b = boundaryRef.current;
      const m = mapRefRef.current.current?.getMap();
      if (!m || !b.geojson || b.resolveStatus !== 'resolved') return;

      // Guard on our specific sources rather than isStyleLoaded()
      const fillSource = m.getSource(fillSourceId) as GeoJSONSource | undefined;
      const strokeSource = m.getSource(strokeSourceId) as GeoJSONSource | undefined;
      if (!fillSource || !strokeSource) return;

      const style = b.style;
      const isAnimating = style.animateStroke;
      const animStyle = style.animationStyle || 'fade';
      const traceLen = style.traceLength || 0.1;

      const progress = getNormalizedProgress(state.playheadTime, b.startTime, b.endTime, b.easing);

      // --- Fill ---
      const fillProgress = animStyle === 'fade' ? progress : Math.max(0, (progress - 0.7) / 0.3);
      const fillOpacity = style.fillOpacity * fillProgress;
      const fillFC: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: b.geojson }],
      };

      try {
        m.setPaintProperty(fillLayerId, 'fill-color', style.fillColor);
        m.setPaintProperty(fillLayerId, 'fill-opacity', fillOpacity);
      } catch (_) {}
      fillSource.setData(fillFC);

      // --- Stroke ---
      let strokeFC: GeoJSON.FeatureCollection;
      if (!isAnimating || animStyle === 'fade') {
        strokeFC = fillFC;
      } else {
        const rings = extractLineStringsFromGeometry(b.geojson!);
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
          if (segment.length >= 2) animatedRings.push(segment);
        }
        strokeFC = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {},
            geometry: { type: 'MultiLineString', coordinates: animatedRings },
          }],
        };
      }

      const strokeOpacity = animStyle === 'fade'
        ? Math.min(progress * 2, 1)
        : (progress > 0 ? 1 : 0);

      try {
        m.setPaintProperty(strokeLayerId, 'line-color', style.strokeColor);
        m.setPaintProperty(strokeLayerId, 'line-width', style.strokeWidth);
        m.setPaintProperty(strokeLayerId, 'line-opacity', strokeOpacity);
      } catch (_) {}
      strokeSource.setData(strokeFC);
    };

    const unsub = useProjectStore.subscribe(updateBoundary);
    // Initial pump: populate layers immediately with the current state
    updateBoundary(useProjectStore.getState());

    return () => {
      destroyed = true;
      unsub();
      const m = mapRefRef.current.current?.getMap();
      if (!m) return;
      if (m.getLayer(strokeLayerId)) try { m.removeLayer(strokeLayerId); } catch (_) {}
      if (m.getLayer(fillLayerId)) try { m.removeLayer(fillLayerId); } catch (_) {}
      if (m.getSource(strokeSourceId)) try { m.removeSource(strokeSourceId); } catch (_) {}
      if (m.getSource(fillSourceId)) try { m.removeSource(fillSourceId); } catch (_) {}
    };
  // Re-run only when styleLoaded or boundary.id changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleLoaded, boundary.id, boundary.resolveStatus]);

  return null;
}

// ---------------------------------------------------------------------------
// CalloutMarker — self-subscribes to playheadTime; parent never re-renders it for time
// ---------------------------------------------------------------------------

function CalloutMarker({
  callout,
  mapRef,
  isSelected,
}: {
  callout: CalloutItem;
  mapRef: React.MutableRefObject<MapRef | null>;
  isSelected: boolean;
}) {
  const updateItem = useProjectStore((s) => s.updateItem);
  // Self-subscribe to only what this marker needs
  const playheadTime = useProjectStore((s) => s.playheadTime);
  const isMoveModeActive = useProjectStore((s) => s.isMoveModeActive);
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

  // Visibility check — return null when outside time range (unless in move mode)
  const isVisibleTime = playheadTime >= callout.startTime && playheadTime <= callout.endTime;
  if (!isActuallyInMoveMode && !isVisibleTime) return null;

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
      pitchAlignment="viewport"
      rotationAlignment="viewport"
    >
      <CalloutCard callout={callout} phase={phase} progress={animProgress} altitudeOffset={altitudeOffset} />
    </Marker>
  );
}

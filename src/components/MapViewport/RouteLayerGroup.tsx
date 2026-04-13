import React, { useEffect, useRef, useMemo } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
import type { GeoJSONSource } from 'mapbox-gl';
import { useProjectStore } from '@/store/useProjectStore';
import type { RouteItem } from '@/store/types';
import { getNormalizedProgress } from '@/engine/easings';
import { getLineSegment, getAnimatedLine } from '@/engine/lineAnimation';
import { VehicleModelLayer } from './VehicleModelLayer';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const EXIT_DURATION = 0.5; // seconds for exit animation after endTime

interface RouteLayerGroupProps {
  route: RouteItem;
  mapRef: React.MutableRefObject<MapRef | null>;
  styleLoaded: boolean;
}

/**
 * RouteLayerGroup — imperative manager, renders null
 * Adds sources/layers on mount, calls setData() on every playhead change.
 */
export function RouteLayerGroup({
  route,
  mapRef,
  styleLoaded,
}: RouteLayerGroupProps) {
  // Pre-compute the flat coords array — only recalculated when route.geojson changes
  const coords = useMemo(() => {
    const allCoords: number[][] = [];
    for (const feature of route.geojson.features) {
      const geom = feature.geometry;
      if (geom.type === 'LineString') allCoords.push(...(geom as any).coordinates);
      else if (geom.type === 'MultiLineString') for (const line of (geom as any).coordinates) allCoords.push(...line);
    }
    return allCoords;
  }, [route.geojson]);

  const lastTimeRef = useRef(-1);
  const routeRef = useRef(route);
  routeRef.current = route;
  const coordsRef = useRef(coords);
  coordsRef.current = coords;

  const mapRefRef = useRef(mapRef);
  mapRefRef.current = mapRef;

  const updateFnRef = useRef<(state: ReturnType<typeof useProjectStore.getState>) => void>(() => {});

  // Mount effect: add sources + layers imperatively, subscribe to playhead, clean up on unmount
  useEffect(() => {
    if (!styleLoaded) return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    const mainId = `route-${route.id}`;
    const mainLayerId = `route-layer-${route.id}`;
    const glowId = `route-glow-${route.id}`;
    const glowLayerId = `route-glow-layer-${route.id}`;
    const cometId = `route-comet-${route.id}`;
    const cometLayerId = `route-comet-layer-${route.id}`;

    // Add main source
    if (!map.getSource(mainId)) {
      map.addSource(mainId, { type: 'geojson', data: EMPTY_FC });
    }
    // Add glow source (always add; layer rendered conditionally)
    if (!map.getSource(glowId)) {
      map.addSource(glowId, { type: 'geojson', data: EMPTY_FC });
    }
    // Add comet source — lineMetrics:true is required for line-gradient paint
    if (!map.getSource(cometId)) {
      map.addSource(cometId, { type: 'geojson', data: EMPTY_FC, lineMetrics: true } as any);
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
    // Add comet trail layer (initially empty; line-gradient requires lineMetrics source)
    if (!map.getLayer(cometLayerId)) {
      map.addLayer({
        id: cometLayerId,
        type: 'line',
        source: cometId,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-width': routeRef.current.style.width,
          'line-gradient': [
            'interpolate', ['linear'], ['line-progress'],
            0, 'transparent',
            1, routeRef.current.style.color,
          ] as any,
        },
      });
    }

    // `destroyed` flag prevents callbacks running after cleanup (in-flight race protection).
    let destroyed = false;

    // Named update function — extracted so it can be called immediately as an initial pump.
    const updateRoute = (state: ReturnType<typeof useProjectStore.getState>) => {
      if (destroyed) return;
      const r = routeRef.current;
      const c = coordsRef.current;
      const m = mapRefRef.current.current?.getMap();
      if (!m) return;

      const mainSource = m.getSource(mainId) as GeoJSONSource | undefined;
      if (!mainSource) return;

      if (c.length < 2) {
        mainSource.setData(EMPTY_FC);
        return;
      }

      const isFlight = r.calculation?.mode === 'flight';
      const routeColor = isFlight ? '#f59e0b' : r.style.color;
      const glowColor = isFlight ? '#fbbf24' : r.style.glowColor;
      const progress = getNormalizedProgress(state.playheadTime, r.startTime, r.endTime, r.easing);
      const animType = r.style.animationType || 'draw';

      // --- Compute geometry per animation type ---
      let mainFC: GeoJSON.FeatureCollection = EMPTY_FC;
      let cometFC: GeoJSON.FeatureCollection = EMPTY_FC;

      if (animType === 'comet') {
        const trailLen = r.style.cometTrailLength ?? 0.2;
        const tailT = Math.max(0, progress - trailLen);
        const trailCoords = getLineSegment(c, tailT, progress);
        if (trailCoords.length >= 2) {
          cometFC = {
            type: 'FeatureCollection',
            features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: trailCoords } }],
          };
        }
      } else if (animType === 'navigation') {
        const navCoords = getLineSegment(c, progress, 1);
        if (navCoords.length >= 2) {
          mainFC = {
            type: 'FeatureCollection',
            features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: navCoords } }],
          };
        }
      } else {
        let drawP = progress;
        if (r.exitAnimation && state.playheadTime > r.endTime) {
          const exitT = Math.min((state.playheadTime - r.endTime) / EXIT_DURATION, 1);
          drawP = 1 - exitT;
        }
        const animCoords = getAnimatedLine(c, drawP);
        if (animCoords.length >= 2) {
          mainFC = {
            type: 'FeatureCollection',
            features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: animCoords } }],
          };
        }
      }

      // --- Main line ---
      try {
        m.setPaintProperty(mainLayerId, 'line-color', routeColor);
        m.setPaintProperty(mainLayerId, 'line-width', r.style.width);
      } catch (_) {}
      mainSource.setData(mainFC);

      // --- Comet trail ---
      const cometSource = m.getSource(cometId) as GeoJSONSource | undefined;
      if (cometSource) {
        try {
          m.setPaintProperty(cometLayerId, 'line-width', r.style.width);
          m.setPaintProperty(cometLayerId, 'line-gradient', [
            'interpolate', ['linear'], ['line-progress'],
            0, 'transparent',
            1, routeColor,
          ] as any);
        } catch (_) {}
        cometSource.setData(cometFC);
      }

      // --- Glow ---
      const glowSource = m.getSource(glowId) as GeoJSONSource | undefined;
      if (r.style.glow && glowSource && animType !== 'comet') {
        if (!m.getLayer(glowLayerId)) {
          try {
            m.addLayer(
              {
                id: glowLayerId,
                type: 'line',
                source: glowId,
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: {
                  'line-color': glowColor,
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
            m.setPaintProperty(glowLayerId, 'line-color', glowColor);
            m.setPaintProperty(glowLayerId, 'line-width', r.style.width * 3);
            m.setPaintProperty(glowLayerId, 'line-blur', r.style.width * 2);
          } catch (_) {}
        }
        glowSource.setData(mainFC);
      } else if (m.getLayer(glowLayerId)) {
        try { m.removeLayer(glowLayerId); } catch (_) {}
      }
    };

    updateFnRef.current = updateRoute;

    const unsub = useProjectStore.subscribe((state) => {
      if (state.playheadTime === lastTimeRef.current) return;
      lastTimeRef.current = state.playheadTime;
      updateRoute(state);
    });
    
    updateRoute(useProjectStore.getState());

    return () => {
      destroyed = true;
      unsub();
      const m = mapRefRef.current.current?.getMap();
      if (!m) return;
      if (m.getLayer(glowLayerId)) try { m.removeLayer(glowLayerId); } catch (_) {}
      if (m.getLayer(cometLayerId)) try { m.removeLayer(cometLayerId); } catch (_) {}
      if (m.getLayer(mainLayerId)) try { m.removeLayer(mainLayerId); } catch (_) {}
      if (m.getSource(glowId)) try { m.removeSource(glowId); } catch (_) {}
      if (m.getSource(cometId)) try { m.removeSource(cometId); } catch (_) {}
      if (m.getSource(mainId)) try { m.removeSource(mainId); } catch (_) {}
    };
  }, [styleLoaded, route.id]);

  useEffect(() => {
    updateFnRef.current(useProjectStore.getState());
  }, [route.style, route.startTime, route.endTime, route.easing, route.exitAnimation]);

  if (route.calculation?.vehicle?.enabled) {
    return <VehicleAnimatedLayer route={route} coords={coords} />;
  }

  return null;
}

/**
 * Thin wrapper that self-subscribes to playheadTime to feed VehicleModelLayer.
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

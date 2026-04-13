import React, { useEffect, useRef, useMemo } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
import type { GeoJSONSource } from 'mapbox-gl';
import { useProjectStore } from '@/store/useProjectStore';
import type { RouteItem } from '@/store/types';
import { getNormalizedProgress } from '@/engine/easings';
import { getLineSegment, getAnimatedLine } from '@/engine/lineAnimation';
import { calculateBearing, calculatePitch } from '@/engine/geoUtils';
import { VehicleModelLayer } from './VehicleModelLayer';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const EXIT_DURATION = 0.5; // seconds for exit animation after endTime

interface RouteLayerGroupProps {
  route: RouteItem;
  mapRef: React.MutableRefObject<MapRef | null>;
  styleLoaded: boolean;
}

/**
 * RouteLayerGroup — imperative manager, renders null (or a VehicleModelLayer for setup).
 * Full route geometry is uploaded once per geometry change. Per-frame updates use
 * line-trim-offset (draw/navigation) or setData on the bounded comet source (comet mode).
 * Vehicle position is updated inside the same subscribe loop — no React re-renders per frame.
 */
export function RouteLayerGroup({
  route,
  mapRef,
  styleLoaded,
}: RouteLayerGroupProps) {
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

  // Per-frame paint cache: avoids calling setPaintProperty with unchanged values at 60 fps.
  const lastPaintRef = useRef({
    mainColor: '', mainWidth: -1, mainVisible: true,
    mainTrimStart: -1, mainTrimEnd: -1,
    glowColor: '', glowWidth: -1,
    glowTrimStart: -1, glowTrimEnd: -1,
    cometColor: '', cometWidth: -1,
    lastAnimType: '',
  });

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

    // Reset paint cache whenever layers are recreated (style reload or route id change)
    lastPaintRef.current = {
      mainColor: '', mainWidth: -1, mainVisible: true,
      mainTrimStart: -1, mainTrimEnd: -1,
      glowColor: '', glowWidth: -1,
      glowTrimStart: -1, glowTrimEnd: -1,
      cometColor: '', cometWidth: -1,
      lastAnimType: '',
    };

    // lineMetrics: true is required for line-trim-offset (used by draw and navigation modes)
    if (!map.getSource(mainId)) map.addSource(mainId, { type: 'geojson', data: EMPTY_FC, lineMetrics: true } as any);
    if (!map.getSource(glowId)) map.addSource(glowId, { type: 'geojson', data: EMPTY_FC, lineMetrics: true } as any);
    if (!map.getSource(cometId)) map.addSource(cometId, { type: 'geojson', data: EMPTY_FC, lineMetrics: true } as any);

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

    // Glow layer is always present; visibility toggled per frame instead of add/remove.
    // Adding/removing inside the animation callback causes per-frame layer churn.
    if (!map.getLayer(glowLayerId)) {
      const r0 = routeRef.current;
      const glowColor0 = r0.calculation?.mode === 'flight' ? '#fbbf24' : (r0.style.glowColor || r0.style.color);
      map.addLayer(
        {
          id: glowLayerId,
          type: 'line',
          source: glowId,
          layout: { 'line-cap': 'round', 'line-join': 'round', 'visibility': 'none' },
          paint: {
            'line-color': glowColor0,
            'line-width': r0.style.width * 3,
            'line-opacity': 0.35,
            'line-blur': r0.style.width * 2,
          },
        },
        mainLayerId,
      );
    }

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

    let destroyed = false;

    const updateRoute = (state: ReturnType<typeof useProjectStore.getState>) => {
      if (destroyed) return;
      const r = routeRef.current;
      const c = coordsRef.current;
      const m = mapRefRef.current.current?.getMap();
      if (!m) return;

      const mainSource = m.getSource(mainId) as GeoJSONSource | undefined;
      if (!mainSource || c.length < 2) return;

      const isFlight = r.calculation?.mode === 'flight';
      const routeColor = isFlight ? '#f59e0b' : r.style.color;
      const glowColor = isFlight ? '#fbbf24' : r.style.glowColor;
      const progress = getNormalizedProgress(state.playheadTime, r.startTime, r.endTime, r.easing);
      const animType = r.style.animationType || 'draw';
      const lp = lastPaintRef.current;

      // Clear comet source when leaving comet mode
      if (lp.lastAnimType === 'comet' && animType !== 'comet') {
        const cs = m.getSource(cometId) as GeoJSONSource | undefined;
        if (cs) cs.setData(EMPTY_FC);
      }
      lp.lastAnimType = animType;

      if (animType === 'comet') {
        // Hide main line; comet source carries the visible sliced trail
        if (lp.mainVisible) {
          try { m.setLayoutProperty(mainLayerId, 'visibility', 'none'); } catch (_) {}
          lp.mainVisible = false;
        }

        const cometSource = m.getSource(cometId) as GeoJSONSource | undefined;
        if (cometSource) {
          const trailLen = r.style.cometTrailLength ?? 0.2;
          const tailT = Math.max(0, progress - trailLen);
          const trailCoords = getLineSegment(c, tailT, progress);
          const cometFC: GeoJSON.FeatureCollection = trailCoords.length >= 2
            ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: trailCoords } }] }
            : EMPTY_FC;
          if (lp.cometColor !== routeColor) {
            try {
              m.setPaintProperty(cometLayerId, 'line-gradient', [
                'interpolate', ['linear'], ['line-progress'],
                0, 'transparent',
                1, routeColor,
              ] as any);
              lp.cometColor = routeColor;
            } catch (_) {}
          }
          if (lp.cometWidth !== r.style.width) {
            try { m.setPaintProperty(cometLayerId, 'line-width', r.style.width); } catch (_) {}
            lp.cometWidth = r.style.width;
          }
          cometSource.setData(cometFC);
        }
      } else {
        // draw or navigation: full geometry lives in mainSource; use line-trim-offset per frame
        if (!lp.mainVisible) {
          try { m.setLayoutProperty(mainLayerId, 'visibility', 'visible'); } catch (_) {}
          lp.mainVisible = true;
        }

        let trimStart: number;
        let trimEnd: number;

        if (animType === 'navigation') {
          // Erase the passed portion (0…progress), show the remaining route (progress…1)
          trimStart = 0;
          trimEnd = progress;
        } else {
          // draw: reveal from start (0…drawP), hide the rest (drawP…1)
          let drawP = progress;
          if (r.exitAnimation === 'reverse' && state.playheadTime > r.endTime) {
            const exitT = Math.min((state.playheadTime - r.endTime) / EXIT_DURATION, 1);
            drawP = 1 - exitT;
          }
          trimStart = drawP;
          trimEnd = 1;
        }

        let opacity = 1;
        if (state.playheadTime > r.endTime && r.exitAnimation === 'fade') {
          const fadeT = Math.min((state.playheadTime - r.endTime) / EXIT_DURATION, 1);
          opacity = 1 - fadeT;
        }

        if (lp.mainColor !== routeColor) {
          try { m.setPaintProperty(mainLayerId, 'line-color', routeColor); } catch (_) {}
          lp.mainColor = routeColor;
        }
        try { m.setPaintProperty(mainLayerId, 'line-opacity', opacity); } catch (_) {}
        if (lp.mainWidth !== r.style.width) {
          try { m.setPaintProperty(mainLayerId, 'line-width', r.style.width); } catch (_) {}
          lp.mainWidth = r.style.width;
        }
        if (lp.mainTrimStart !== trimStart || lp.mainTrimEnd !== trimEnd) {
          try { m.setPaintProperty(mainLayerId, 'line-trim-offset', [trimStart, trimEnd]); } catch (_) {}
          lp.mainTrimStart = trimStart;
          lp.mainTrimEnd = trimEnd;
        }
      }

      // --- Glow: toggle via visibility, mirror trim offset from main line ---
      const glowSource = m.getSource(glowId) as GeoJSONSource | undefined;
      const glowVisible = r.style.glow && animType !== 'comet';
      try { m.setLayoutProperty(glowLayerId, 'visibility', glowVisible ? 'visible' : 'none'); } catch (_) {}
      if (glowVisible && glowSource) {
        if (lp.glowColor !== routeColor) {
          try { m.setPaintProperty(glowLayerId, 'line-color', routeColor); } catch (_) {}
          lp.glowColor = routeColor;
        }
        let glowOpacity = 0.35;
        if (state.playheadTime > r.endTime && r.exitAnimation === 'fade') {
          const fadeT = Math.min((state.playheadTime - r.endTime) / EXIT_DURATION, 1);
          glowOpacity *= (1 - fadeT);
        }
        try { m.setPaintProperty(glowLayerId, 'line-opacity', glowOpacity); } catch (_) {}
        if (lp.glowWidth !== r.style.width) {
          try {
            m.setPaintProperty(glowLayerId, 'line-width', r.style.width * 3);
            m.setPaintProperty(glowLayerId, 'line-blur', r.style.width * 2);
            lp.glowWidth = r.style.width;
          } catch (_) {}
        }
        const gt0 = lp.mainTrimStart;
        const gt1 = lp.mainTrimEnd;
        if (lp.glowTrimStart !== gt0 || lp.glowTrimEnd !== gt1) {
          try { m.setPaintProperty(glowLayerId, 'line-trim-offset', [gt0, gt1]); } catch (_) {}
          lp.glowTrimStart = gt0;
          lp.glowTrimEnd = gt1;
        }
      }

      // --- Vehicle: update position imperatively, no React re-renders per frame ---
      if (r.calculation?.vehicle?.enabled && c.length >= 2) {
        const vSourceId = `vehicle-source-${r.id}`;
        const vLayerId = `vehicle-layer-${r.id}`;
        const vSource = m.getSource(vSourceId) as GeoJSONSource | undefined;
        if (vSource) {
          // Vehicle head is always at progress along the full route, regardless of animType
          const headCoords = getAnimatedLine(c, progress);
          if (headCoords.length >= 2) {
            const currentPos = headCoords[headCoords.length - 1];
            const prevPos = headCoords[headCoords.length - 2];
            vSource.setData({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [currentPos[0], currentPos[1]] },
              properties: {},
            });
            if (r.calculation.vehicle.type !== 'dot') {
              const bearing = calculateBearing(prevPos, currentPos);
              const pitch = calculatePitch(prevPos, currentPos);
              try { m.setPaintProperty(vLayerId, 'model-rotation', [0, -pitch, bearing]); } catch (_) {}
              try { m.setPaintProperty(vLayerId, 'model-translation', [0, 0, currentPos[2] || 0]); } catch (_) {}
            }
          }
        }
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

  // Upload full geometry to main and glow sources whenever the route geometry changes.
  // The per-frame callback uses line-trim-offset instead of setData for draw/navigation modes,
  // so the geometry only needs to reach the GPU once per route change.
  useEffect(() => {
    if (!styleLoaded) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const c = coordsRef.current;
    const mainId = `route-${route.id}`;
    const glowId = `route-glow-${route.id}`;
    const fullFC: GeoJSON.FeatureCollection = c.length >= 2
      ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } }] }
      : EMPTY_FC;
    (map.getSource(mainId) as GeoJSONSource | undefined)?.setData(fullFC);
    (map.getSource(glowId) as GeoJSONSource | undefined)?.setData(fullFC);
  }, [coords, styleLoaded, route.id]);

  useEffect(() => {
    updateFnRef.current(useProjectStore.getState());
  }, [route.style, route.startTime, route.endTime, route.easing, route.exitAnimation]);

  if (!route.calculation?.vehicle?.enabled) return null;
  return <VehicleModelLayer routeId={route.id} vehicle={route.calculation.vehicle!} color={route.style.color} mapRef={mapRef} />;
}

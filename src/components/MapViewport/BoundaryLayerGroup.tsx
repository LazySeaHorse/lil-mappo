import React, { useEffect, useRef } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
import type { GeoJSONSource } from 'mapbox-gl';
import { useProjectStore } from '@/store/useProjectStore';
import type { BoundaryItem } from '@/store/types';
import { getNormalizedProgress } from '@/engine/easings';
import { extractLineStringsFromGeometry } from '@/engine/geoUtils';
import { getLineSegment } from '@/engine/lineAnimation';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const EXIT_DURATION = 0.5; // seconds for exit animation after endTime

interface BoundaryLayerGroupProps {
  boundary: BoundaryItem;
  mapRef: React.MutableRefObject<MapRef | null>;
  styleLoaded: boolean;
}

/**
 * BoundaryLayerGroup — imperative manager, renders null
 */
export function BoundaryLayerGroup({
  boundary,
  mapRef,
  styleLoaded,
}: BoundaryLayerGroupProps) {
  const lastTimeRef = useRef(-1);
  const boundaryRef = useRef(boundary);
  boundaryRef.current = boundary;

  const mapRefRef = useRef(mapRef);
  mapRefRef.current = mapRef;

  const updateFnRef = useRef<(state: ReturnType<typeof useProjectStore.getState>) => void>(() => {});

  // Paint property cache: avoids calling setPaintProperty with unchanged values at 60 fps.
  const lastPaintRef = useRef({ strokeColor: '', strokeWidth: -1, glowVisible: false });

  // Geometry cache: fill and static-stroke geometry only need setData when b.geojson changes.
  const lastGeojsonRef = useRef<GeoJSON.Geometry | null>(null);

  useEffect(() => {
    if (!styleLoaded) return;
    if (!boundary.geojson || boundary.resolveStatus !== 'resolved') return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    const fillSourceId = `boundary-fill-${boundary.id}`;
    const fillLayerId = `boundary-fill-layer-${boundary.id}`;
    const strokeSourceId = `boundary-stroke-${boundary.id}`;
    const strokeLayerId = `boundary-stroke-layer-${boundary.id}`;

    // Reset caches when layers are recreated (style reload or resolve status change)
    lastPaintRef.current = { fillColor: '', strokeColor: '', strokeWidth: -1 };
    lastGeojsonRef.current = null;

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
          'fill-color': b.style.strokeColor,
          'fill-opacity': 0,
        },
      });
    }

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

    const glowLayerId = `boundary-glow-layer-${boundary.id}`;
    if (!map.getLayer(glowLayerId)) {
      const b = boundaryRef.current;
      map.addLayer(
        {
          id: glowLayerId,
          type: 'line',
          source: strokeSourceId,
          layout: { 'line-cap': 'round', 'line-join': 'round', 'visibility': 'none' },
          paint: {
            'line-color': b.style.strokeColor,
            'line-width': b.style.strokeWidth * 3,
            'line-opacity': 0.35,
            'line-blur': b.style.strokeWidth * 2,
          },
        },
        strokeLayerId
      );
    }

    let destroyed = false;

    const updateBoundary = (state: ReturnType<typeof useProjectStore.getState>) => {
      if (destroyed) return;
      const b = boundaryRef.current;
      const m = mapRefRef.current.current?.getMap();
      if (!m || !b.geojson || b.resolveStatus !== 'resolved') return;

      const fillSource = m.getSource(fillSourceId) as GeoJSONSource | undefined;
      const strokeSource = m.getSource(strokeSourceId) as GeoJSONSource | undefined;
      if (!fillSource || !strokeSource) return;

      const style = b.style;
      const isAnimating = style.animateStroke;
      const animStyle = style.animationStyle || 'fade';
      const traceLen = style.traceLength || 0.1;
      const glowLayerId = `boundary-glow-layer-${b.id}`;

      const progress = getNormalizedProgress(state.playheadTime, b.startTime, b.endTime, b.easing);

      const isExiting = b.exitAnimation !== 'none' && state.playheadTime > b.endTime;
      const exitT = isExiting ? Math.min((state.playheadTime - b.endTime) / EXIT_DURATION, 1) : 0;
      const reverseP = 1 - exitT;
      const isFadeExit = b.exitAnimation === 'fade' && isExiting;
      const isReverseExit = b.exitAnimation === 'reverse' && isExiting;

      // --- Static paint properties: only update when values change ---
      const lp = lastPaintRef.current;
      const glowVisible = style.glow && !isReverseExit;

      if (lp.strokeColor !== style.strokeColor) {
        try { m.setPaintProperty(fillLayerId, 'fill-color', style.strokeColor); } catch (_) {}
        try { m.setPaintProperty(strokeLayerId, 'line-color', style.strokeColor); } catch (_) {}
        try { m.setPaintProperty(glowLayerId, 'line-color', style.strokeColor); } catch (_) {}
        lp.strokeColor = style.strokeColor;
      }
      if (lp.strokeWidth !== style.strokeWidth) {
        try { m.setPaintProperty(strokeLayerId, 'line-width', style.strokeWidth); } catch (_) {}
        try {
          m.setPaintProperty(glowLayerId, 'line-width', style.strokeWidth * 3);
          m.setPaintProperty(glowLayerId, 'line-blur', style.strokeWidth * 2);
        } catch (_) {}
        lp.strokeWidth = style.strokeWidth;
      }
      if (lp.glowVisible !== glowVisible) {
        try { m.setLayoutProperty(glowLayerId, 'visibility', glowVisible ? 'visible' : 'none'); } catch (_) {}
        lp.glowVisible = glowVisible;
      }

      // --- Fill ---
      let fillProgress: number;
      if (isReverseExit) {
        fillProgress = animStyle === 'draw' ? Math.max(0, (reverseP - 0.7) / 0.3) : reverseP;
      } else {
        fillProgress = animStyle === 'fade' ? progress : Math.max(0, (progress - 0.7) / 0.3);
      }
      
      let fillOpacity = style.fillOpacity * fillProgress;
      if (isFadeExit) fillOpacity *= reverseP;

      const geojsonChanged = lastGeojsonRef.current !== b.geojson;
      if (geojsonChanged) {
        lastGeojsonRef.current = b.geojson;
        fillSource.setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', properties: {}, geometry: b.geojson }],
        });
      }
      try { m.setPaintProperty(fillLayerId, 'fill-opacity', fillOpacity); } catch (_) {}

      // --- Stroke & Glow (Shared Source) ---
      const isStrokeGeometryStatic = !isAnimating || animStyle === 'fade';
      let strokeOpacity: number;

      if (isReverseExit) {
        if (isStrokeGeometryStatic) {
          strokeOpacity = Math.min(reverseP * 2, 1);
        } else if (animStyle === 'draw') {
          strokeOpacity = reverseP > 0 ? 1 : 0;
        } else {
          strokeOpacity = reverseP;
        }
      } else {
        strokeOpacity = animStyle === 'fade' ? Math.min(progress * 2, 1) : (progress > 0 ? 1 : 0);
        if (isFadeExit) strokeOpacity *= reverseP;
      }

      if (!isStrokeGeometryStatic || geojsonChanged) {
        let strokeFC: GeoJSON.FeatureCollection;
        if (isStrokeGeometryStatic) {
          strokeFC = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: b.geojson! }] };
        } else {
          const rings = extractLineStringsFromGeometry(b.geojson!);
          const animatedRings: number[][][] = [];
          for (const ring of rings) {
            let segment: number[][];
            if (animStyle === 'draw') {
              if (isReverseExit) {
                // Eraser mode: remove from start of ring to end
                segment = getLineSegment(ring, exitT, 1);
              } else {
                segment = getLineSegment(ring, 0, progress);
              }
            } else {
              const p = isReverseExit ? reverseP : progress;
              const start = p * (1 + traceLen) - traceLen;
              const end = p * (1 + traceLen);
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
        strokeSource.setData(strokeFC);
      }

      try { m.setPaintProperty(strokeLayerId, 'line-opacity', strokeOpacity); } catch (_) {}
      if (glowVisible) {
        try { m.setPaintProperty(glowLayerId, 'line-opacity', 0.35 * strokeOpacity); } catch (_) {}
      }
    };

    const unsub = useProjectStore.subscribe((state) => {
      if (state.playheadTime === lastTimeRef.current) return;
      lastTimeRef.current = state.playheadTime;
      updateBoundary(state);
    });

    updateFnRef.current = updateBoundary;
    updateBoundary(useProjectStore.getState());

    return () => {
      destroyed = true;
      unsub();
      const m = mapRefRef.current.current?.getMap();
      if (!m) return;
      if (m.getLayer(glowLayerId)) try { m.removeLayer(glowLayerId); } catch (_) {}
      if (m.getLayer(strokeLayerId)) try { m.removeLayer(strokeLayerId); } catch (_) {}
      if (m.getLayer(fillLayerId)) try { m.removeLayer(fillLayerId); } catch (_) {}
      if (m.getSource(strokeSourceId)) try { m.removeSource(strokeSourceId); } catch (_) {}
      if (m.getSource(fillSourceId)) try { m.removeSource(fillSourceId); } catch (_) {}
    };
  }, [styleLoaded, boundary.id, boundary.resolveStatus]);

  useEffect(() => {
    updateFnRef.current(useProjectStore.getState());
  }, [boundary.style, boundary.startTime, boundary.endTime, boundary.easing, boundary.exitAnimation]);

  return null;
}

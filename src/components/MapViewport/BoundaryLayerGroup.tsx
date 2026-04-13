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
  const lastPaintRef = useRef({ fillColor: '', strokeColor: '', strokeWidth: -1 });

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
          'fill-color': b.style.fillColor,
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

      const progress = getNormalizedProgress(state.playheadTime, b.startTime, b.endTime, b.easing);

      const isExiting = b.exitAnimation === true && state.playheadTime > b.endTime;
      const exitT = isExiting ? Math.min((state.playheadTime - b.endTime) / EXIT_DURATION, 1) : 0;
      const reverseP = 1 - exitT;

      // --- Static paint properties: only update when values change ---
      const lp = lastPaintRef.current;
      if (lp.fillColor !== style.fillColor) {
        try { m.setPaintProperty(fillLayerId, 'fill-color', style.fillColor); } catch (_) {}
        lp.fillColor = style.fillColor;
      }
      if (lp.strokeColor !== style.strokeColor) {
        try { m.setPaintProperty(strokeLayerId, 'line-color', style.strokeColor); } catch (_) {}
        lp.strokeColor = style.strokeColor;
      }
      if (lp.strokeWidth !== style.strokeWidth) {
        try { m.setPaintProperty(strokeLayerId, 'line-width', style.strokeWidth); } catch (_) {}
        lp.strokeWidth = style.strokeWidth;
      }

      // --- Fill ---
      let fillProgress: number;
      if (isExiting) {
        fillProgress = animStyle === 'draw'
          ? Math.max(0, (reverseP - 0.7) / 0.3)
          : reverseP;
      } else {
        fillProgress = animStyle === 'fade' ? progress : Math.max(0, (progress - 0.7) / 0.3);
      }
      const fillOpacity = style.fillOpacity * fillProgress;

      // Fill geometry is always the full polygon — only upload when b.geojson reference changes
      const geojsonChanged = lastGeojsonRef.current !== b.geojson;
      if (geojsonChanged) {
        lastGeojsonRef.current = b.geojson;
        const fillFC: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: [{ type: 'Feature', properties: {}, geometry: b.geojson }],
        };
        fillSource.setData(fillFC);
      }
      // Opacity always changes during animation
      try { m.setPaintProperty(fillLayerId, 'fill-opacity', fillOpacity); } catch (_) {}

      // --- Stroke ---
      const fillFC: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: b.geojson }],
      };

      let strokeFC: GeoJSON.FeatureCollection;
      let strokeOpacity: number;

      // Whether stroke geometry is static (same polygon every frame) or animated per-frame
      const isStrokeGeometryStatic = !isAnimating || animStyle === 'fade';

      if (isExiting) {
        if (!isAnimating || animStyle === 'fade') {
          strokeFC = fillFC;
          strokeOpacity = Math.min(reverseP * 2, 1);
        } else if (animStyle === 'draw') {
          const rings = extractLineStringsFromGeometry(b.geojson!);
          const animatedRings: number[][][] = [];
          for (const ring of rings) {
            const segment = getLineSegment(ring, 0, reverseP);
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
          strokeOpacity = reverseP > 0 ? 1 : 0;
        } else {
          strokeFC = fillFC;
          strokeOpacity = reverseP;
        }
      } else {
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
        strokeOpacity = animStyle === 'fade'
          ? Math.min(progress * 2, 1)
          : (progress > 0 ? 1 : 0);
      }

      // Skip setData for static stroke geometry unless b.geojson itself changed
      if (!isStrokeGeometryStatic || geojsonChanged) {
        strokeSource.setData(strokeFC);
      }
      try { m.setPaintProperty(strokeLayerId, 'line-opacity', strokeOpacity); } catch (_) {}
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

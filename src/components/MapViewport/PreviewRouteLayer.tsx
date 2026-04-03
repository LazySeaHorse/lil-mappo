import React, { useEffect, useState, useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/mapbox';
import { useProjectStore } from '@/store/useProjectStore';
import { getAnimatedLine } from '@/engine/lineAnimation';

export const PreviewRouteLayer = () => {
  const previewRoute = useProjectStore((s) => s.previewRoute);
  const [progress, setProgress] = useState(0);

  // Trigger animation when previewRoute changes
  useEffect(() => {
    if (!previewRoute) {
      setProgress(0);
      return;
    }

    let start: number | null = null;
    const duration = 1200; // 1.2s to draw the preview

    const animate = (time: number) => {
      if (!start) start = time;
      const elapsed = time - start;
      const p = Math.min(elapsed / duration, 1);
      
      // Use easeOutQuad for a smooth finish
      const eased = p * (2 - p);
      setProgress(eased);

      if (p < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [previewRoute]);

  const animatedData = useMemo(() => {
    if (!previewRoute || progress === 0) return null;

    const allCoords: number[][] = [];
    for (const feature of previewRoute.features) {
      const geom = feature.geometry;
      if (geom.type === 'LineString') allCoords.push(...(geom as any).coordinates);
      else if (geom.type === 'MultiLineString') {
        for (const line of (geom as any).coordinates) allCoords.push(...line);
      }
    }

    if (allCoords.length < 2) return null;

    const animCoords = getAnimatedLine(allCoords, progress);
    if (animCoords.length < 2) return null;

    return {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: animCoords
        }
      }]
    };
  }, [previewRoute, progress]);

  if (!animatedData) return null;

  return (
    <Source id="preview-route" type="geojson" data={animatedData}>
      {/* Subtle glow for the preview */}
      <Layer
        id="preview-route-glow"
        type="line"
        paint={{
          'line-color': '#3b82f6',
          'line-width': 12,
          'line-opacity': 0.2,
          'line-blur': 8
        }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
      <Layer
        id="preview-route-line"
        type="line"
        paint={{
          'line-color': '#3b82f6',
          'line-width': 3,
          'line-dasharray': [2, 2], // Dashed to indicate it's a "draft"
        }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
    </Source>
  );
};

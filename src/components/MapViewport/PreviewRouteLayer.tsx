import { useEffect, useState, useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/mapbox';
import { useProjectStore } from '@/store/useProjectStore';
import { extractLineCoords, splitAtAntimeridian } from '@/engine/geoUtils';
import { getAnimatedLine } from '@/engine/lineAnimation';

export const PreviewRouteLayer = () => {
  const previewRoute = useProjectStore((s) => s.previewRoute);
  const previewSpokes = useProjectStore((s) => s.previewSpokes);
  const spokeFocus = useProjectStore((s) => s.previewSpokeFocus);
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

    const allCoords = extractLineCoords(previewRoute);

    if (allCoords.length < 2) return null;

    const animCoords = getAnimatedLine(allCoords, progress);
    if (animCoords.length < 2) return null;

    const geometry = splitAtAntimeridian(animCoords);

    return {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        properties: {},
        geometry,
      }]
    };
  }, [previewRoute, progress]);

  // Hub and spoke: one feature per spoke, drawn whole (the paths arrive one by one); the hovered one is bolder.
  const spokeData = useMemo(() => {
    const features = previewSpokes.flatMap(({ id, geojson }) => {
      const coords = extractLineCoords(geojson);
      return coords.length < 2
        ? []
        : [{ type: 'Feature' as const, properties: { id }, geometry: splitAtAntimeridian(coords) }];
    });
    return features.length ? { type: 'FeatureCollection' as const, features } : null;
  }, [previewSpokes]);

  const focused = ['==', ['get', 'id'], spokeFocus ?? ''];

  return (
    <>
      {spokeData && (
        <Source id="preview-spokes" type="geojson" data={spokeData}>
          <Layer
            id="preview-spokes-glow"
            type="line"
            paint={{
              'line-color': '#3b82f6',
              'line-width': 12,
              'line-opacity': ['case', focused, 0.4, 0.2],
              'line-blur': 8,
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
          <Layer
            id="preview-spokes-line"
            type="line"
            paint={{
              'line-color': '#3b82f6',
              'line-width': ['case', focused, 5, 3],
              'line-dasharray': [2, 2],
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </Source>
      )}
      {animatedData && (
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
      )}
    </>
  );
};

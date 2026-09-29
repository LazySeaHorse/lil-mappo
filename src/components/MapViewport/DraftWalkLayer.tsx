import React, { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/mapbox';
import { useProjectStore } from '@/store/useProjectStore';
import { buildWalkGeometry } from '@/engine/routeCurves';

/** Live line for the walk being drafted; redraws on every point or curve change (no animation). */
export const DraftWalkLayer = () => {
  const draft = useProjectStore((s) => s.draftWalk);
  const data = useMemo(() => (draft ? buildWalkGeometry(draft) : null), [draft]);

  if (!data || data.features.length === 0) return null;

  return (
    <Source id="draft-walk" type="geojson" data={data}>
      <Layer
        id="draft-walk-glow"
        type="line"
        paint={{ 'line-color': '#3b82f6', 'line-width': 12, 'line-opacity': 0.2, 'line-blur': 8 }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
      <Layer
        id="draft-walk-line"
        type="line"
        paint={{ 'line-color': '#3b82f6', 'line-width': 3, 'line-dasharray': [2, 2] }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
    </Source>
  );
};

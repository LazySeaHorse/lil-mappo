import React from 'react';
import { Source, Layer } from 'react-map-gl/mapbox';
import { useProjectStore } from '@/store/useProjectStore';
import { useShallow } from 'zustand/react/shallow';
import { applyBoundaryDetail } from '@/engine/boundaryDetail';
import { resolveBoundaryFillColor } from './layerStyleContracts';

export function PreviewBoundaryLayer() {
  const { previewBoundary, previewBoundaryStyle, boundaryDetail } = useProjectStore(
    useShallow(s => ({
      previewBoundary: s.previewBoundary,
      previewBoundaryStyle: s.previewBoundaryStyle,
      boundaryDetail: s.boundaryDetail,
    }))
  );

  // The preview shows exactly what will be added: the raw result at the chosen detail level (memoised).
  const geojsonData = React.useMemo<GeoJSON.FeatureCollection | null>(() => previewBoundary ? ({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: applyBoundaryDetail(previewBoundary, boundaryDetail),
      },
    ],
  }) : null, [previewBoundary, boundaryDetail]);

  if (!geojsonData || !previewBoundaryStyle) return null;

  return (
    <>
      <Source id="preview-boundary-fill" type="geojson" data={geojsonData}>
        <Layer
          id="preview-boundary-fill-layer"
          type="fill"
          paint={{
            'fill-color': resolveBoundaryFillColor(previewBoundaryStyle),
            'fill-opacity': previewBoundaryStyle.fillOpacity,
          }}
        />
      </Source>
      <Source id="preview-boundary-stroke" type="geojson" data={geojsonData}>
        <Layer
          id="preview-boundary-stroke-layer"
          type="line"
          paint={{
            'line-color': previewBoundaryStyle.strokeColor,
            'line-width': previewBoundaryStyle.strokeWidth,
            'line-opacity': 0.8,
            'line-dasharray': [2, 1],
          }}
          layout={{
            'line-cap': 'round',
            'line-join': 'round',
          }}
        />
      </Source>
    </>
  );
}

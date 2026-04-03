import React from 'react';
import { Source, Layer } from 'react-map-gl/mapbox';
import { useProjectStore } from '@/store/useProjectStore';

export function PreviewBoundaryLayer() {
  const { previewBoundary, previewBoundaryStyle } = useProjectStore();

  if (!previewBoundary || !previewBoundaryStyle) return null;

  const geojsonData: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: previewBoundary,
      },
    ],
  };

  return (
    <>
      <Source id="preview-boundary-fill" type="geojson" data={geojsonData}>
        <Layer
          id="preview-boundary-fill-layer"
          type="fill"
          paint={{
            'fill-color': previewBoundaryStyle.fillColor,
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

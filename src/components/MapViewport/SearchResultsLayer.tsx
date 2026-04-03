import React from 'react';
import { Source, Layer } from 'react-map-gl/mapbox';
import { useProjectStore } from '@/store/useProjectStore';

export const SearchResultsLayer = () => {
  const searchResults = useProjectStore((s) => s.searchResults);
  const hoveredId = useProjectStore((s) => s.hoveredSearchResultId);

  if (!searchResults || searchResults.length === 0) return null;

  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: searchResults.map((r) => ({
      type: 'Feature',
      id: r.id,
      geometry: {
        type: 'Point',
        coordinates: r.lngLat
      },
      properties: {
        id: r.id,
        name: r.name
      }
    }))
  };

  return (
    <Source id="search-results" type="geojson" data={geojson}>
      {/* Pulse Glow for Hovered Result */}
      <Layer
        id="search-results-glow"
        type="circle"
        paint={{
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            ['case', ['==', ['get', 'id'], hoveredId || ''], 20, 0],
            18,
            ['case', ['==', ['get', 'id'], hoveredId || ''], 40, 0]
          ],
          'circle-color': '#3b82f6',
          'circle-opacity': 0.3,
          'circle-blur': 0.5
        }}
      />
      <Layer
        id="search-results-circles"
        type="circle"
        paint={{
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            ['case', ['==', ['get', 'id'], hoveredId || ''], 10, 6],
            18,
            ['case', ['==', ['get', 'id'], hoveredId || ''], 20, 12]
          ],
          'circle-color': [
            'case',
            ['==', ['get', 'id'], hoveredId || ''],
            '#2563eb', // Deeper blue on hover
            '#3b82f6'
          ],
          'circle-stroke-width': [
            'case',
            ['==', ['get', 'id'], hoveredId || ''],
            4,
            2
          ],
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.9
        }}
      />
      <Layer
        id="search-results-labels"
        type="symbol"
        minzoom={12}
        layout={{
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
          'text-size': 12
        }}
        paint={{
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 1
        }}
      />
    </Source>
  );
};

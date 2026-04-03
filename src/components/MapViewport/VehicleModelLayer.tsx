import React, { useEffect } from 'react';
import { useMap } from 'react-map-gl/mapbox';
import { calculateBearing, calculatePitch } from '@/engine/geoUtils';

interface VehicleModelLayerProps {
  routeId: string;
  coords: number[][]; 
  vehicle: {
    type: 'car' | 'plane';
    modelId: string;
    scale: number;
    enabled: boolean;
  };
}

const MODELS = {
  car: 'https://docs.mapbox.com/mapbox-gl-js/assets/car.glb',
  plane: 'https://docs.mapbox.com/mapbox-gl-js/assets/airplane.glb'
};

/**
 * Renders a 3D model following a route.
 * Managed imperatively via the Mapbox instance for v3 model-layer support.
 */
export const VehicleModelLayer = ({ routeId, coords, vehicle }: VehicleModelLayerProps) => {
  const { current: mapRef } = useMap();
  const map = mapRef?.getMap();
  const layerId = `vehicle-layer-${routeId}`;
  const sourceId = `vehicle-source-${routeId}`;

  // 1. Model Loading
  useEffect(() => {
    if (!map || !vehicle.enabled) return;
    const url = MODELS[vehicle.type];
    
    // @ts-ignore - Mapbox v3 specific API
    if (map.addModel && !map.hasModel(vehicle.type)) {
      // @ts-ignore
      map.addModel(vehicle.type, url);
    }
  }, [map, vehicle.type, vehicle.enabled]);

  // 2. Layer & Position Management
  useEffect(() => {
    if (!map || !vehicle.enabled || coords.length < 2) {
      if (map && map.getLayer(layerId)) {
        map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      }
      return;
    }

    const currentPos = coords[coords.length - 1];
    const prevPos = coords[coords.length - 2];
    
    const bearing = calculateBearing(prevPos, currentPos);
    const pitch = calculatePitch(prevPos, currentPos);

    if (!map.getLayer(layerId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [currentPos[0], currentPos[1]]
          },
          properties: {}
        }
      });

      map.addLayer({
        id: layerId,
        type: 'model',
        source: sourceId,
        layout: {
          'model-id': vehicle.type
        },
        paint: {
          'model-scale': [vehicle.scale, vehicle.scale, vehicle.scale],
          'model-rotation': [0, -pitch, bearing],
          'model-translation': [0, 0, currentPos[2] || 0]
        }
      });
    } else {
      const source = map.getSource(sourceId) as any;
      if (source) {
        source.setData({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [currentPos[0], currentPos[1]]
          },
          properties: {}
        });
      }
      map.setPaintProperty(layerId, 'model-rotation', [0, -pitch, bearing]);
      map.setPaintProperty(layerId, 'model-translation', [0, 0, currentPos[2] || 0]);
      map.setPaintProperty(layerId, 'model-scale', [vehicle.scale, vehicle.scale, vehicle.scale]);
    }

    return () => {
      // We don't remove immediately on every coordinate update to avoid flicker,
      // but we do on unmount or if vehicle is disabled.
    };
  }, [map, routeId, coords, vehicle.type, vehicle.scale, vehicle.enabled, layerId, sourceId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (map && map.getLayer(layerId)) {
        map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      }
    };
  }, [map, layerId, sourceId]);

  return null;
};

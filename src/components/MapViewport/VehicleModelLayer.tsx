import React, { useEffect } from 'react';
import { useMap } from 'react-map-gl/mapbox';
import { calculateBearing, calculatePitch } from '@/engine/geoUtils';

interface VehicleModelLayerProps {
  routeId: string;
  coords: number[][];
  vehicle: {
    type: 'car' | 'plane' | 'dot';
    modelId: string;
    scale: number;
    enabled: boolean;
  };
}

const MODELS: Record<'car' | 'plane', string> = {
  car: '/models/car.glb',
  plane: '/models/airplane.glb',
};

// Base radius in pixels at scale=1. Matches roughly Google Maps dot size.
const DOT_BASE_RADIUS = 9;

/**
 * Renders a vehicle marker following a route.
 * - type='dot': Mapbox circle layer (blue GPS dot, free for all users)
 * - type='car'|'plane': Mapbox v3 model layer (Pro only, gated in RoutePlanner)
 */
export const VehicleModelLayer = ({ routeId, coords, vehicle }: VehicleModelLayerProps) => {
  const { current: mapRef } = useMap();
  const map = mapRef?.getMap();
  const layerId = `vehicle-layer-${routeId}`;
  const sourceId = `vehicle-source-${routeId}`;

  // Load 3D GLB model when using car/plane (no-op for dot)
  useEffect(() => {
    if (!map || !vehicle.enabled || vehicle.type === 'dot') return;
    const url = MODELS[vehicle.type];
    // @ts-ignore — Mapbox v3 specific API
    if (map.addModel && !map.hasModel(vehicle.type)) {
      // @ts-ignore
      map.addModel(vehicle.type, url);
    }
  }, [map, vehicle.type, vehicle.enabled]);

  // Layer & position management
  useEffect(() => {
    if (!map || !vehicle.enabled || coords.length < 2) {
      if (map?.getLayer(layerId)) {
        map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      }
      return;
    }

    const currentPos = coords[coords.length - 1];
    const prevPos = coords[coords.length - 2];
    const bearing = calculateBearing(prevPos, currentPos);
    const pitch = calculatePitch(prevPos, currentPos);

    const pointData = {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [currentPos[0], currentPos[1]] },
      properties: {},
    };

    // If layer type changed (dot↔3D model), tear down and rebuild
    if (map.getLayer(layerId)) {
      const existingType = map.getLayer(layerId)?.type;
      const expectedType = vehicle.type === 'dot' ? 'circle' : 'model';
      if (existingType !== expectedType) {
        map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      }
    }

    if (!map.getLayer(layerId)) {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, { type: 'geojson', data: pointData });
      }

      if (vehicle.type === 'dot') {
        map.addLayer({
          id: layerId,
          type: 'circle',
          source: sourceId,
          paint: {
            'circle-radius': DOT_BASE_RADIUS * vehicle.scale,
            'circle-color': '#4285F4',
            'circle-stroke-color': '#FFFFFF',
            'circle-stroke-width': 2.5,
            'circle-stroke-opacity': 1,
          },
        });
      } else {
        map.addLayer({
          id: layerId,
          type: 'model',
          source: sourceId,
          layout: { 'model-id': vehicle.type },
          paint: {
            'model-scale': [vehicle.scale, vehicle.scale, vehicle.scale],
            'model-rotation': [0, -pitch, bearing],
            'model-translation': [0, 0, currentPos[2] || 0],
          },
        });
      }
    } else {
      // Update position/orientation on existing layer
      const source = map.getSource(sourceId) as any;
      if (source) source.setData(pointData);

      if (vehicle.type === 'dot') {
        try { map.setPaintProperty(layerId, 'circle-radius', DOT_BASE_RADIUS * vehicle.scale); } catch (_) {}
      } else {
        try {
          map.setPaintProperty(layerId, 'model-rotation', [0, -pitch, bearing]);
          map.setPaintProperty(layerId, 'model-translation', [0, 0, currentPos[2] || 0]);
          map.setPaintProperty(layerId, 'model-scale', [vehicle.scale, vehicle.scale, vehicle.scale]);
        } catch (_) {}
      }
    }
  }, [map, routeId, coords, vehicle.type, vehicle.scale, vehicle.enabled, layerId, sourceId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (map?.getLayer(layerId)) {
        map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      }
    };
  }, [map, layerId, sourceId]);

  return null;
};

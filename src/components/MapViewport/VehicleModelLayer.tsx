import React, { useEffect } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';

interface VehicleModelLayerProps {
  routeId: string;
  vehicle: {
    type: 'car' | 'plane' | 'dot';
    modelId: string;
    scale: number;
    enabled: boolean;
  };
  color: string;
  mapRef: React.MutableRefObject<MapRef | null>;
}

const MODELS: Record<'car' | 'plane', string> = {
  car: '/models/car.glb',
  plane: '/models/airplane.glb',
};

// Base radius in pixels at scale=1. Matches roughly Google Maps dot size.
const DOT_BASE_RADIUS = 9;

/**
 * Manages vehicle source + layer lifecycle only — no per-frame position updates.
 * Position is driven imperatively inside RouteLayerGroup's updateRoute subscribe loop,
 * keeping vehicle animation out of the React render cycle entirely.
 */
export const VehicleModelLayer = ({ routeId, vehicle, color, mapRef }: VehicleModelLayerProps) => {
  const layerId = `vehicle-layer-${routeId}`;
  const sourceId = `vehicle-source-${routeId}`;

  // Load 3D GLB model for car/plane (no-op for dot)
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || vehicle.type === 'dot') return;
    const url = MODELS[vehicle.type as 'car' | 'plane'];
    // @ts-ignore — Mapbox v3 specific API
    if (map.addModel && !map.hasModel(vehicle.type)) {
      // @ts-ignore
      map.addModel(vehicle.type, url);
    }
  }, [mapRef, vehicle.type]);

  // Layer setup: add source + layer, handle type switches, update scale.
  // Position updates are NOT handled here — see RouteLayerGroup.updateRoute.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    // If layer type changed (dot ↔ 3D model), tear down and rebuild
    if (map.getLayer(layerId)) {
      const existingType = map.getLayer(layerId)?.type;
      const expectedType = vehicle.type === 'dot' ? 'circle' : 'model';
      if (existingType !== expectedType) {
        try { map.removeLayer(layerId); } catch (_) {}
        if (map.getSource(sourceId)) try { map.removeSource(sourceId); } catch (_) {}
      }
    }

    // Initialize with an empty point; updateRoute will set the real position on its next tick
    const emptyPoint: GeoJSON.Feature<GeoJSON.Point> = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: {},
    };

    if (!map.getLayer(layerId)) {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, { type: 'geojson', data: emptyPoint });
      }

      if (vehicle.type === 'dot') {
        map.addLayer({
          id: layerId,
          type: 'circle',
          source: sourceId,
          paint: {
            'circle-radius': DOT_BASE_RADIUS * vehicle.scale,
            'circle-color': color,
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
            'model-rotation': [0, 0, 0],
            'model-translation': [0, 0, 0],
          },
        });
      }
    } else {
      // Layer already exists — only update scale (position comes from updateRoute)
      if (vehicle.type === 'dot') {
        try { 
          map.setPaintProperty(layerId, 'circle-radius', DOT_BASE_RADIUS * vehicle.scale); 
          map.setPaintProperty(layerId, 'circle-color', color);
        } catch (_) {}
      } else {
        try { map.setPaintProperty(layerId, 'model-scale', [vehicle.scale, vehicle.scale, vehicle.scale]); } catch (_) {}
      }
    }
  }, [mapRef, vehicle.type, vehicle.scale, color, layerId, sourceId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      if (map.getLayer(layerId)) try { map.removeLayer(layerId); } catch (_) {}
      if (map.getSource(sourceId)) try { map.removeSource(sourceId); } catch (_) {}
    };
  }, [mapRef, layerId, sourceId]);

  return null;
};

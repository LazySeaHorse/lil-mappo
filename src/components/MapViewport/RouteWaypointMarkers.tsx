import React, { useRef } from 'react';
import { Marker } from 'react-map-gl/mapbox';
import type { MarkerDragEvent } from 'react-map-gl/mapbox';
import { useProjectStore } from '@/store/useProjectStore';
import type { RouteItem } from '@/store/types';
import { buildRouteFeatureCollection } from '@/engine/routeCurves';

export function RouteWaypointMarkers() {
  const selectedItemId = useProjectStore((s) => s.selectedItemId);
  const selectedItem = useProjectStore((s) => (selectedItemId ? s.items[selectedItemId] : null));
  const updateItem = useProjectStore((s) => s.updateItem);

  const isDraggingRef = useRef(false);

  if (!selectedItem || selectedItem.kind !== 'route') {
    return null;
  }

  const route = selectedItem as RouteItem;
  const calc = route.calculation;
  if (!calc) return null;

  // Active in manual mode, or when curved/waypoints are specified, or if freeform is enabled
  const isFreeform =
    calc.mode === 'manual' ||
    calc.curved !== undefined ||
    (calc.waypoints && calc.waypoints.length > 0);

  if (!isFreeform) return null;

  const startPoint = calc.startPoint;
  const waypoints = calc.waypoints || [];
  const endPoint = calc.endPoint;

  const hasStart = startPoint && (startPoint[0] !== 0 || startPoint[1] !== 0);
  const hasEnd = endPoint && (endPoint[0] !== 0 || endPoint[1] !== 0);

  if (!hasStart && !hasEnd && waypoints.length === 0) {
    return null;
  }

  const updateGeometry = (
    newStart: [number, number],
    newWaypoints: [number, number][],
    newEnd: [number, number]
  ) => {
    const allPoints: [number, number][] = [];
    if (newStart && (newStart[0] !== 0 || newStart[1] !== 0)) allPoints.push(newStart);
    for (const wp of newWaypoints) {
      if (wp && (wp[0] !== 0 || wp[1] !== 0)) allPoints.push(wp);
    }
    if (newEnd && (newEnd[0] !== 0 || newEnd[1] !== 0)) allPoints.push(newEnd);

    const isCurved = calc.curved ?? true;
    const sharpness = calc.sharpness ?? 0.85;

    const geojson = allPoints.length >= 2
      ? buildRouteFeatureCollection(allPoints, { curved: isCurved, sharpness })
      : route.geojson;

    updateItem(route.id, {
      geojson,
      calculation: {
        ...calc,
        startPoint: newStart,
        waypoints: newWaypoints,
        endPoint: newEnd,
        curved: isCurved,
        sharpness,
      },
    });
  };

  const handleDrag = (type: 'start' | 'end' | number, e: MarkerDragEvent) => {
    const newCoord: [number, number] = [e.lngLat.lng, e.lngLat.lat];
    let nextStart = startPoint;
    let nextWaypoints = [...waypoints];
    let nextEnd = endPoint;

    if (type === 'start') {
      nextStart = newCoord;
    } else if (type === 'end') {
      nextEnd = newCoord;
    } else {
      nextWaypoints[type] = newCoord;
    }

    updateGeometry(nextStart, nextWaypoints, nextEnd);
  };

  return (
    <>
      {/* Start Point Marker */}
      {hasStart && (
        <Marker
          longitude={startPoint[0]}
          latitude={startPoint[1]}
          draggable
          anchor="center"
          onDragStart={() => { isDraggingRef.current = true; }}
          onDrag={(e) => handleDrag('start', e)}
          onDragEnd={(e) => {
            isDraggingRef.current = false;
            handleDrag('start', e);
          }}
        >
          <div
            className="group relative flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
            title="Start Point (drag to bend route)"
          >
            <div className="w-5 h-5 rounded-full bg-emerald-500 text-white font-bold text-[10px] flex items-center justify-center shadow-lg ring-2 ring-white hover:scale-125 transition-transform">
              S
            </div>
          </div>
        </Marker>
      )}

      {/* Intermediate Waypoint Markers */}
      {waypoints.map((wp, idx) => (
        <Marker
          key={`wp-${idx}`}
          longitude={wp[0]}
          latitude={wp[1]}
          draggable
          anchor="center"
          onDragStart={() => { isDraggingRef.current = true; }}
          onDrag={(e) => handleDrag(idx, e)}
          onDragEnd={(e) => {
            isDraggingRef.current = false;
            handleDrag(idx, e);
          }}
        >
          <div
            className="group relative flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
            title={`Waypoint ${idx + 1} (drag to bend route)`}
          >
            <div className="w-5 h-5 rounded-full bg-blue-500 text-white font-bold text-[10px] flex items-center justify-center shadow-lg ring-2 ring-white hover:scale-125 transition-transform">
              {idx + 1}
            </div>
          </div>
        </Marker>
      ))}

      {/* End Point Marker */}
      {hasEnd && (
        <Marker
          longitude={endPoint[0]}
          latitude={endPoint[1]}
          draggable
          anchor="center"
          onDragStart={() => { isDraggingRef.current = true; }}
          onDrag={(e) => handleDrag('end', e)}
          onDragEnd={(e) => {
            isDraggingRef.current = false;
            handleDrag('end', e);
          }}
        >
          <div
            className="group relative flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
            title="End Point (drag to bend route)"
          >
            <div className="w-5 h-5 rounded-full bg-rose-500 text-white font-bold text-[10px] flex items-center justify-center shadow-lg ring-2 ring-white hover:scale-125 transition-transform">
              E
            </div>
          </div>
        </Marker>
      )}
    </>
  );
}

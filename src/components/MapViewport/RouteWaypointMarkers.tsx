import React from 'react';
import { Marker } from 'react-map-gl/mapbox';
import type { MarkerDragEvent } from 'react-map-gl/mapbox';
import { useProjectStore } from '@/store/useProjectStore';
import { applyFreeformPatch, isFreeformRoute, type FreeformPatch } from '@/engine/routeCurves';

export function RouteWaypointMarkers() {
  const selectedItemId = useProjectStore((s) => s.selectedItemId);
  const selectedItem = useProjectStore((s) => (selectedItemId ? s.items[selectedItemId] : null));
  const updateItem = useProjectStore((s) => s.updateItem);

  if (!selectedItem || selectedItem.kind !== 'route') return null;
  const calc = selectedItem.calculation;
  if (!calc || !isFreeformRoute(calc)) return null;

  const routeId = selectedItem.id;
  const { startPoint, endPoint } = calc;
  const waypoints = calc.waypoints ?? [];

  const hasStart = startPoint[0] !== 0 || startPoint[1] !== 0;
  const hasEnd = endPoint[0] !== 0 || endPoint[1] !== 0;
  if (!hasStart && !hasEnd && waypoints.length === 0) return null;

  const handleDrag = (target: 'start' | 'end' | number, e: MarkerDragEvent) => {
    // Read the latest route so consecutive drag events build on each other.
    const current = useProjectStore.getState().items[routeId];
    if (current?.kind !== 'route' || !current.calculation) return;
    const point: [number, number] = [e.lngLat.lng, e.lngLat.lat];
    const patch: FreeformPatch =
      target === 'start' ? { startPoint: point }
        : target === 'end' ? { endPoint: point }
          : { waypoints: (current.calculation.waypoints ?? []).map((p, i) => (i === target ? point : p)) };
    updateItem(routeId, applyFreeformPatch(current, patch));
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
          onDrag={(e) => handleDrag('start', e)}
          onDragEnd={(e) => handleDrag('start', e)}
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
          onDrag={(e) => handleDrag(idx, e)}
          onDragEnd={(e) => handleDrag(idx, e)}
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
          onDrag={(e) => handleDrag('end', e)}
          onDragEnd={(e) => handleDrag('end', e)}
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

import React, { useCallback, useEffect } from 'react';
import { Marker } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import { useProjectStore } from '@/store/useProjectStore';
import type { CalloutItem } from '@/store/types';
import CalloutCard from './CalloutCard';

interface CalloutMarkerProps {
  callout: CalloutItem;
  mapRef: React.MutableRefObject<MapRef | null>;
  isSelected: boolean;
}

/**
 * CalloutMarker — self-subscribes to playheadTime; parent never re-renders it for time
 */
export function CalloutMarker({
  callout,
  mapRef,
  isSelected,
}: CalloutMarkerProps) {
  const updateItem = useProjectStore((s) => s.updateItem);
  // Self-subscribe to only what this marker needs
  const playheadTime = useProjectStore((s) => s.playheadTime);
  const isMoveModeActive = useProjectStore((s) => s.isMoveModeActive);
  const debounceRef = React.useRef<NodeJS.Timeout | null>(null);

  const isActuallyInMoveMode = isSelected && isMoveModeActive;

  const handleDragEnd = useCallback((e: any) => {
    const newLngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
    
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    debounceRef.current = setTimeout(() => {
      updateItem(callout.id, { lngLat: newLngLat } as any);
    }, 500);
  }, [callout.id, updateItem]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (callout.lngLat[0] === 0 && callout.lngLat[1] === 0) return null;

  // Visibility check — return null when outside time range (unless in move mode)
  const isVisibleTime = playheadTime >= callout.startTime && playheadTime <= callout.endTime;
  if (!isActuallyInMoveMode && !isVisibleTime) return null;

  const enterEnd = callout.startTime + callout.animation.enterDuration;
  const exitStart = callout.endTime - callout.animation.exitDuration;
  let phase: 'enter' | 'visible' | 'exit' = 'visible';
  let animProgress = 1;
  if (playheadTime < enterEnd) { phase = 'enter'; animProgress = (playheadTime - callout.startTime) / callout.animation.enterDuration; }
  else if (playheadTime > exitStart) { phase = 'exit'; animProgress = (playheadTime - exitStart) / callout.animation.exitDuration; }

  // Compute pixel offset for altitude (3D effect via marker offset)
  const map = mapRef.current?.getMap?.();
  let altitudeOffset = 0;
  if (map && callout.altitude > 0) {
    const zoom = map.getZoom();
    const metersPerPixel = 156543.03392 * Math.cos(callout.lngLat[1] * Math.PI / 180) / Math.pow(2, zoom);
    altitudeOffset = callout.altitude / metersPerPixel;
    altitudeOffset = Math.min(altitudeOffset, 300);
  }

  // If in move mode, show crosshair at altitude 0
  if (isActuallyInMoveMode) {
    return (
      <Marker
        longitude={callout.lngLat[0]}
        latitude={callout.lngLat[1]}
        anchor="center"
        draggable
        onDragEnd={handleDragEnd}
      >
        <div className="group relative flex items-center justify-center cursor-move">
          {/* Pulsing ring */}
          <div className="absolute w-12 h-12 rounded-full border-2 border-primary/50 animate-ping" />
          {/* Crosshair SVG */}
          <svg width="40" height="40" viewBox="0 0 40 40" className="text-primary drop-shadow-lg scale-110">
            <circle cx="20" cy="20" r="4" fill="currentColor" />
            <path d="M20 5 L20 15 M20 25 L20 35 M5 20 L15 20 M25 20 L35 20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
          </svg>
          {/* Coordinates tooltip */}
          <div className="absolute top-10 whitespace-nowrap bg-background/90 text-[10px] px-1.5 py-0.5 rounded border border-border shadow-sm font-mono opacity-0 group-hover:opacity-100 transition-opacity">
            {callout.lngLat[1].toFixed(4)}, {callout.lngLat[0].toFixed(4)}
          </div>
        </div>
      </Marker>
    );
  }

  return (
    <Marker
      longitude={callout.lngLat[0]}
      latitude={callout.lngLat[1]}
      anchor="bottom"
      offset={[0, 0] as [number, number]}
      pitchAlignment="viewport"
      rotationAlignment="viewport"
    >
      <CalloutCard callout={callout} phase={phase} progress={animProgress} altitudeOffset={altitudeOffset} />
    </Marker>
  );
}

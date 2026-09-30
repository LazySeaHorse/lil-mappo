/**
 * AnnotationLayer — the live editor's callouts.
 *
 * Callouts are drawn by one overlay canvas that follows the map's render loop
 * (see AnnotationOverlay). What stays in React is the drag handle shown while
 * positioning a callout.
 */

import React, { useEffect } from 'react';
import { Marker, useMap } from 'react-map-gl/mapbox';
import type { MarkerDragEvent } from 'react-map-gl/mapbox';
import { useProjectStore } from '@/store/useProjectStore';
import type { CalloutItem } from '@/store/types';
import { AnnotationOverlay } from './AnnotationOverlay';

// ─── Move-mode handle ─────────────────────────────────────────────────────────

function AnnotationMoveHandle({ callout, lngLat }: { callout: CalloutItem; lngLat: [number, number] }) {
  const updateItem = useProjectStore((s) => s.updateItem);

  const handleDragEnd = (e: MarkerDragEvent) => {
    if (callout.binding.kind !== 'geographic') return;
    updateItem(callout.id, {
      binding: { ...callout.binding, lngLat: [e.lngLat.lng, e.lngLat.lat] },
    });
  };

  return (
    <Marker
      longitude={lngLat[0]}
      latitude={lngLat[1]}
      anchor="center"
      draggable
      onDragEnd={handleDragEnd}
    >
      <div className="group relative flex items-center justify-center cursor-move">
        <div className="absolute w-12 h-12 rounded-full border-2 border-primary/50 animate-ping" />
        <svg width="40" height="40" viewBox="0 0 40 40" className="text-primary drop-shadow-lg scale-110">
          <circle cx="20" cy="20" r="4" fill="currentColor" />
          <path d="M20 5 L20 15 M20 25 L20 35 M5 20 L15 20 M25 20 L35 20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
        </svg>
        <div className="absolute top-10 whitespace-nowrap bg-background/90 text-[10px] px-1.5 py-0.5 rounded border border-border shadow-sm font-mono opacity-0 group-hover:opacity-100 transition-opacity">
          {lngLat[1].toFixed(5)}, {lngLat[0].toFixed(5)}
        </div>
      </div>
    </Marker>
  );
}

// ─── Annotation layer ─────────────────────────────────────────────────────────

/** The overlay canvas for the map this layer sits in. */
function useAnnotationOverlay(): void {
  const { current } = useMap();
  const map = current?.getMap();

  useEffect(() => {
    if (!map) return;
    const overlay = new AnnotationOverlay(map);
    overlay.mount();
    return () => overlay.dispose();
  }, [map]);
}

/** The drag handle of the selected callout, while it is being positioned. */
function MoveHandle() {
  const callout = useProjectStore((s) => {
    const item = s.selectedItemId ? s.items[s.selectedItemId] : undefined;
    return s.isMoveModeActive && item?.kind === 'callout' ? item : null;
  });
  if (callout?.binding.kind !== 'geographic') return null;
  const { lngLat } = callout.binding;
  if (lngLat[0] === 0 && lngLat[1] === 0) return null;
  return <AnnotationMoveHandle callout={callout} lngLat={lngLat} />;
}

export function AnnotationLayer() {
  useAnnotationOverlay();
  return <MoveHandle />;
}

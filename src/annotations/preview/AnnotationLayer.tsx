/**
 * AnnotationLayer — renders callouts on the live map.
 *
 * Each visible callout is drawn into its own canvas marker using the same
 * frame pipeline as the export compositor (see ../draw). The canvas is sized
 * to the frame bounds and positioned so the callout's ground point lands on
 * its map coordinate, so the preview matches exported frames pixel for pixel.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Marker } from 'react-map-gl/mapbox';
import type { MarkerDragEvent } from 'react-map-gl/mapbox';
import { useProjectStore } from '@/store/useProjectStore';
import type { CalloutItem } from '@/store/types';
import {
  drawAnnotationFrame,
  getFrameBounds,
  prepareAnnotationFrame,
  type AnnotationFrame,
} from '@/annotations/draw';
import { preloadImage } from '@/annotations/scene/renderer';

// ─── Canvas marker ────────────────────────────────────────────────────────────

interface AnnotationCanvasMarkerProps {
  callout: CalloutItem;
  lngLat: [number, number];
  frame: AnnotationFrame;
}

function AnnotationCanvasMarker({ callout, lngLat, frame }: AnnotationCanvasMarkerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imageLoads, setImageLoads] = useState(0);
  const image = callout.content.image;

  // Images load asynchronously; redraw once the callout's image is available.
  useEffect(() => {
    if (!image) return;
    let active = true;
    preloadImage(image)
      .then(() => {
        if (active) setImageLoads((n) => n + 1);
      })
      .catch(() => {
        // The style draws its placeholder when the image cannot load.
      });
    return () => {
      active = false;
    };
  }, [image]);

  const bounds = getFrameBounds(frame);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const dpr = window.devicePixelRatio || 1;

  // Draw after commit: React may have just resized the canvas, which clears it.
  useLayoutEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawAnnotationFrame(ctx, frame, -bounds.minX, -bounds.minY);
  }, [frame, dpr, bounds.minX, bounds.minY, imageLoads]);

  return (
    <Marker
      longitude={lngLat[0]}
      latitude={lngLat[1]}
      anchor="top-left"
      offset={[bounds.minX, bounds.minY]}
      pitchAlignment="viewport"
      rotationAlignment="viewport"
      style={{ pointerEvents: 'none' }}
    >
      <span className="sr-only">{callout.content.title}</span>
      <canvas
        ref={canvasRef}
        width={Math.round(width * dpr)}
        height={Math.round(height * dpr)}
        style={{ width: `${width}px`, height: `${height}px`, display: 'block' }}
      />
    </Marker>
  );
}

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

// ─── Single annotation ────────────────────────────────────────────────────────

interface AnnotationMarkerProps {
  callout: CalloutItem;
  isSelected: boolean;
  playheadTime: number;
}

function AnnotationMarker({ callout, isSelected, playheadTime }: AnnotationMarkerProps) {
  const isMoveModeActive = useProjectStore((s) => s.isMoveModeActive);

  const { binding } = callout;
  if (binding.kind !== 'geographic') return null;
  const lngLat = binding.lngLat;
  if (lngLat[0] === 0 && lngLat[1] === 0) return null;

  if (isSelected && isMoveModeActive) {
    return <AnnotationMoveHandle callout={callout} lngLat={lngLat} />;
  }

  const frame = prepareAnnotationFrame(callout, playheadTime);
  if (!frame) return null;
  return <AnnotationCanvasMarker callout={callout} lngLat={lngLat} frame={frame} />;
}

// ─── Annotation layer ─────────────────────────────────────────────────────────

interface AnnotationLayerProps {
  callouts: CalloutItem[];
  selectedCalloutId: string | null;
}

/**
 * Subscribes to playheadTime here so MapViewport doesn't re-render every frame.
 */
export function AnnotationLayer({ callouts, selectedCalloutId }: AnnotationLayerProps) {
  const playheadTime = useProjectStore((s) => s.playheadTime);

  return (
    <>
      {callouts.map((callout) => (
        <AnnotationMarker
          key={callout.id}
          callout={callout}
          isSelected={selectedCalloutId === callout.id}
          playheadTime={playheadTime}
        />
      ))}
    </>
  );
}

/**
 * AnnotationLayer — manages all annotation markers on the map.
 *
 * Replaces the old CalloutMarkerList + CalloutMarker + CalloutCard stack.
 *
 * Key differences from the old approach:
 * 1. Renders annotations to OffscreenCanvas (not DOM elements)
 * 2. Uses the same Canvas renderer as export — no divergence
 * 3. Supports continuous animations via requestAnimationFrame
 * 4. Passes itemTime for blink/ripple/pulse effects
 */

import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import { Marker } from 'react-map-gl/mapbox';
import type { MapRef, MarkerDragEvent } from 'react-map-gl/mapbox';
import { useProjectStore } from '@/store/useProjectStore';
import type { CalloutItem } from '@/store/types';
import { computePhase, evaluateTransition } from '@/annotations/animation';
import { requireStyle } from '@/annotations/registry';
import { renderScene } from '@/annotations/scene/renderer';
import type { StyleRenderInput, SceneNode, ConnectorConfig } from '@/annotations/types';

// ─── Connector drawing ────────────────────────────────────────────────────────

function renderConnector(
  canvas: HTMLCanvasElement,
  connector: ConnectorConfig,
  altitudeOffset: number,
  opacity: number,
): HTMLCanvasElement | null {
  if (!connector.visible || altitudeOffset <= 0) return null;

  const connW = Math.max(connector.endDotRadius * 2 + 4, connector.width + 4);
  const connH = altitudeOffset + (connector.endDot ? connector.endDotRadius + 2 : 0);

  const connCanvas = document.createElement('canvas');
  connCanvas.width = connW * window.devicePixelRatio;
  connCanvas.height = connH * window.devicePixelRatio;
  const ctx = connCanvas.getContext('2d');
  if (!ctx) return null;

  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.globalAlpha = opacity;

  const cx = connW / 2;

  // Connector line
  ctx.strokeStyle = connector.color;
  ctx.lineWidth = connector.width;
  switch (connector.style) {
    case 'dashed':
      ctx.setLineDash([4, 2]);
      break;
    case 'dotted':
      ctx.setLineDash([2, 2]);
      break;
    default:
      ctx.setLineDash([]);
  }
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, altitudeOffset);
  ctx.stroke();
  ctx.setLineDash([]);

  // End dot
  if (connector.endDot) {
    ctx.globalAlpha = opacity * 0.8;
    ctx.fillStyle = connector.color;
    ctx.beginPath();
    ctx.arc(cx, altitudeOffset, connector.endDotRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  return connCanvas;
}

// ─── Single annotation marker ─────────────────────────────────────────────────

interface AnnotationMarkerProps {
  callout: CalloutItem;
  mapRef: React.MutableRefObject<MapRef | null>;
  isSelected: boolean;
  playheadTime: number;
}

function AnnotationMarker({ callout, mapRef, isSelected, playheadTime }: AnnotationMarkerProps) {
  const updateItem = useProjectStore((s) => s.updateItem);
  const isMoveModeActive = useProjectStore((s) => s.isMoveModeActive);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const connCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const isActuallyInMoveMode = isSelected && isMoveModeActive;

  // Get geographic binding
  const binding = callout.binding;
  if (binding.kind !== 'geographic') return null;

  const lngLat = binding.lngLat;
  if (lngLat[0] === 0 && lngLat[1] === 0) return null;

  // Calculate animation phase
  const phaseResult = computePhase(
    callout.startTime,
    callout.endTime,
    callout.transition.enterDuration,
    callout.transition.exitDuration,
    playheadTime,
  );

  const isVisible = isActuallyInMoveMode || phaseResult != null;
  if (!isVisible) return null;

  // Move mode — show crosshair
  if (isActuallyInMoveMode) {
    const handleDragEnd = (e: MarkerDragEvent) => {
      const newLngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateItem(callout.id, {
          binding: { ...binding, lngLat: newLngLat },
        });
      }, 500);
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

  // Normal rendering — build render input and draw to canvas
  const phase = phaseResult!.phase;
  const progress = phaseResult!.progress;
  const itemTime = playheadTime - callout.startTime;

  // Get the transition
  const transitionName = phase === 'enter' ? callout.transition.enter : callout.transition.exit;
  const transition = evaluateTransition(transitionName, phase, progress);

  // Look up style
  let style;
  try {
    style = requireStyle(callout.styleId);
  } catch {
    // Fallback if style not found
    return null;
  }

  // Populate content with geographic metadata for styles that need it (like topo)
  const enrichedContent = { ...callout.content };
  if (binding.kind === 'geographic') {
    const lat = binding.lngLat[1];
    const lng = binding.lngLat[0];
    const ns = lat >= 0 ? 'N' : 'S';
    const ew = lng >= 0 ? 'E' : 'W';
    if (!enrichedContent.eyebrow) {
      enrichedContent.eyebrow = `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lng).toFixed(4)}° ${ew}`;
    }
    if (!enrichedContent.body && binding.altitude > 0) {
      enrichedContent.body = `ELEV: ${Math.round(binding.altitude * 3.28084)}ft`;
    }
  }

  const renderInput: StyleRenderInput = {
    content: enrichedContent,
    settings: callout.settings,
    phase,
    phaseProgress: progress,
    itemTime,
    playheadTime,
    pixelRatio: window.devicePixelRatio || 1,
  };

  // Render the scene
  const scene = style.render(renderInput);
  const { width: measuredW, height: measuredH } = style.measure(renderInput);

  // Add padding for shadows and effects
  const padding = 24;
  const canvasW = Math.ceil(measuredW + padding * 2);
  const canvasH = Math.ceil(measuredH + padding * 2);
  const dpr = window.devicePixelRatio || 1;

  // Draw to canvas element
  const canvasEl = canvasRef.current || document.createElement('canvas');
  canvasRef.current = canvasEl;
  canvasEl.width = canvasW * dpr;
  canvasEl.height = canvasH * dpr;
  canvasEl.style.width = `${canvasW}px`;
  canvasEl.style.height = `${canvasH}px`;

  const ctx = canvasEl.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    // Apply base transition (opacity, scale, translate)
    ctx.globalAlpha = transition.opacity * callout.opacity;
    ctx.translate(canvasW / 2, canvasH / 2 + transition.translateY);
    ctx.scale(transition.scaleX * callout.scale, transition.scaleY * callout.scale);

    renderScene(ctx, scene);
    ctx.restore();
  }

  // Compute altitude offset
  let altitudeOffset = 0;
  if (style.supportsAltitude !== false && binding.altitude > 0) {
    const map = mapRef.current?.getMap();
    if (map) {
      const zoom = map.getZoom();
      const metersPerPixel =
        (156543.03392 * Math.cos((lngLat[1] * Math.PI) / 180)) / Math.pow(2, zoom);
      altitudeOffset = Math.min(binding.altitude / metersPerPixel, 300);
    }
  }

  // Anchor offset based on anchor position
  const anchorToMapbox = (anchor: string): 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' => {
    switch (anchor) {
      case 'center': return 'center';
      case 'top': return 'top';
      case 'left': return 'left';
      case 'right': return 'right';
      case 'top-left': return 'top-left';
      case 'top-right': return 'top-right';
      case 'bottom-left': return 'bottom-left';
      case 'bottom-right': return 'bottom-right';
      default: return 'bottom';
    }
  };

  return (
    <Marker
      longitude={lngLat[0]}
      latitude={lngLat[1]}
      anchor={anchorToMapbox(callout.anchor)}
      offset={[callout.offset[0], callout.offset[1] - altitudeOffset] as [number, number]}
      pitchAlignment="viewport"
      rotationAlignment="viewport"
    >
      <div className="pointer-events-auto" style={{ overflow: 'visible' }}>
        <span className="sr-only">{callout.content.title}</span>
        <canvas
          ref={(el) => { canvasRef.current = el; }}
          width={canvasW * dpr}
          height={canvasH * dpr}
          style={{
            width: `${canvasW}px`,
            height: `${canvasH}px`,
            pointerEvents: 'none',
          }}
        />
        {/* Connector (rendered separately below the card) */}
        {callout.connector.visible && altitudeOffset > 0 && (
          <svg
            width="2"
            height={altitudeOffset + 4}
            style={{ opacity: transition.opacity * callout.opacity, display: 'block', margin: '0 auto' }}
            className="overflow-visible"
          >
            <line
              x1="1" y1="0" x2="1" y2={altitudeOffset}
              stroke={callout.connector.color}
              strokeWidth={callout.connector.width}
              strokeDasharray={
                callout.connector.style === 'dashed' ? '4 2' :
                callout.connector.style === 'dotted' ? '2 2' : undefined
              }
            />
            {callout.connector.endDot && (
              <circle cx="1" cy={altitudeOffset} r={callout.connector.endDotRadius} fill={callout.connector.color} opacity="0.8" />
            )}
          </svg>
        )}
      </div>
    </Marker>
  );
}

// ─── Annotation layer ─────────────────────────────────────────────────────────

interface AnnotationLayerProps {
  callouts: CalloutItem[];
  selectedCalloutId: string | null;
  mapRef: React.MutableRefObject<MapRef | null>;
}

/**
 * AnnotationLayer — replaces CalloutMarkerList.
 * Subscribes to playheadTime so MapViewport doesn't re-render on every frame.
 */
export function AnnotationLayer({ callouts, selectedCalloutId, mapRef }: AnnotationLayerProps) {
  const playheadTime = useProjectStore((s) => s.playheadTime);

  return (
    <>
      {callouts.map((callout) => (
        <AnnotationMarker
          key={callout.id}
          callout={callout}
          mapRef={mapRef}
          isSelected={selectedCalloutId === callout.id}
          playheadTime={playheadTime}
        />
      ))}
    </>
  );
}

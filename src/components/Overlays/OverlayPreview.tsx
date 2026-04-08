import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Rnd } from 'react-rnd';
import { useProjectStore } from '@/store/useProjectStore';
import { useMapRef } from '@/hooks/useMapRef';
import type { VideoOverlay } from '@/store/types';
import { MapPreviewBackground } from './MapPreviewBackground';
import { cn } from '@/lib/utils';

// ─── Overlay content renderer ─────────────────────────────────────────────────
// Renders actual content (not placeholder boxes) scaled to the preview canvas.

function OverlayContent({
  overlay,
  containerH,
}: {
  overlay: VideoOverlay;
  containerH: number;
}) {
  // Scale font size proportionally to preview height vs logical 1080p height
  const scaledFontSize = ((overlay.fontSize ?? 32) / 1080) * containerH;

  if (overlay.kind === 'image') {
    if (overlay.imageDataUrl) {
      return (
        <img
          src={overlay.imageDataUrl}
          alt=""
          className="w-full h-full object-contain pointer-events-none select-none"
          draggable={false}
        />
      );
    }
    return (
      <div className="w-full h-full flex items-center justify-center">
        <span className="text-white/40 text-[9px] font-mono">No image</span>
      </div>
    );
  }

  if (overlay.kind === 'watermark') {
    return (
      <div
        className="w-full h-full flex items-center justify-end gap-[6%] px-[4%] select-none"
        style={{ opacity: overlay.opacity }}
      >
        <img
          src={`${import.meta.env.BASE_URL}logo.svg`}
          alt=""
          className="h-full w-auto object-contain pointer-events-none"
          draggable={false}
        />
        <span
          style={{
            fontFamily: overlay.fontFamily ?? 'Outfit',
            fontWeight: overlay.fontWeight ?? 'bold',
            fontSize: Math.max(8, scaledFontSize),
            color: overlay.color ?? '#ffffff',
            textShadow: '0 1px 4px rgba(0,0,0,0.7)',
            whiteSpace: 'nowrap',
          }}
        >
          {overlay.text ?? "li'l Mappo"}
        </span>
      </div>
    );
  }

  // Text overlay
  return (
    <div className="w-full h-full flex items-center select-none overflow-hidden">
      <span
        style={{
          fontFamily: overlay.fontFamily ?? 'Outfit',
          fontWeight: overlay.fontWeight ?? 'bold',
          fontSize: Math.max(8, scaledFontSize),
          color: overlay.color ?? '#ffffff',
          textShadow: '0 1px 4px rgba(0,0,0,0.7)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
        }}
      >
        {overlay.text || 'Text overlay'}
      </span>
    </div>
  );
}

// ─── Single draggable/resizable overlay element ───────────────────────────────

function OverlayHandle({
  overlay,
  isSelected,
  onSelect,
  containerW,
  containerH,
}: {
  overlay: VideoOverlay;
  isSelected: boolean;
  onSelect: () => void;
  containerW: number;
  containerH: number;
}) {
  const { updateOverlay } = useProjectStore();

  // Controlled mode: position/size always driven by store or local state.
  // Local state provides smooth visuals during drag/resize; store is
  // updated on stop so other panels stay in sync without per-frame renders.
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [localPos, setLocalPos] = useState({ x: 0, y: 0 });
  const [localSize, setLocalSize] = useState({ width: 0, height: 0 });

  const canResize = overlay.kind === 'image';

  const storePos = { x: overlay.x * containerW, y: overlay.y * containerH };
  const storeSize = { width: overlay.width * containerW, height: overlay.height * containerH };

  return (
    <Rnd
      position={dragging || resizing ? localPos : storePos}
      size={resizing ? localSize : storeSize}
      bounds="parent"
      minWidth={40}
      minHeight={16}
      enableResizing={canResize}
      lockAspectRatio={canResize}
      disableDragging={false}
      onDragStart={() => {
        setDragging(true);
        setLocalPos(storePos);
      }}
      onDrag={(_e, d) => {
        setLocalPos({ x: d.x, y: d.y });
      }}
      onDragStop={(_e, d) => {
        setDragging(false);
        updateOverlay(overlay.id, {
          x: Math.max(0, Math.min(1 - overlay.width, d.x / containerW)),
          y: Math.max(0, Math.min(1 - overlay.height, d.y / containerH)),
        });
      }}
      onResizeStart={() => {
        setResizing(true);
        setLocalPos(storePos);
        setLocalSize(storeSize);
      }}
      onResize={(_e, _dir, ref, _delta, pos) => {
        setLocalPos({ x: pos.x, y: pos.y });
        setLocalSize({ width: ref.offsetWidth, height: ref.offsetHeight });
      }}
      onResizeStop={(_e, _dir, ref, _delta, pos) => {
        setResizing(false);
        updateOverlay(overlay.id, {
          x: Math.max(0, pos.x / containerW),
          y: Math.max(0, pos.y / containerH),
          width: Math.min(1, ref.offsetWidth / containerW),
          height: Math.min(1, ref.offsetHeight / containerH),
        });
      }}
      onMouseDown={onSelect}
      style={{
        opacity: overlay.enabled ? overlay.opacity : 0.3,
        background: 'transparent',
        cursor: 'move',
      }}
      className={cn(
        'select-none',
        isSelected
          ? 'ring-2 ring-primary'
          : 'ring-1 ring-white/25 hover:ring-white/50',
      )}
    >
      <div className="w-full h-full overflow-hidden pointer-events-none">
        <OverlayContent overlay={overlay} containerH={containerH} />
      </div>

      {/* Corner dots — visual only, shown for resizable overlays */}
      {isSelected && canResize && (
        <>
          <div className="absolute -top-1 -left-1 w-2 h-2 bg-primary rounded-full pointer-events-none" />
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full pointer-events-none" />
          <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-primary rounded-full pointer-events-none" />
          <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-primary rounded-full pointer-events-none" />
        </>
      )}
    </Rnd>
  );
}

// ─── Preview container ────────────────────────────────────────────────────────

interface OverlayPreviewProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function OverlayPreview({ selectedId, onSelect }: OverlayPreviewProps) {
  const { overlays, resolution } = useProjectStore();
  const mapRef = useMapRef();

  const [containerW, setContainerW] = useState(0);
  const [containerH, setContainerH] = useState(0);
  const [mapSnapshot, setMapSnapshot] = useState<string | null>(null);

  const ratio = resolution[0] / resolution[1];

  // Capture map snapshot once on mount
  useEffect(() => {
    try {
      const map = mapRef.current?.getMap?.();
      if (map) {
        // preserveDrawingBuffer must be true on the map for this to work.
        // react-map-gl sets it by default for export purposes.
        const dataUrl = map.getCanvas().toDataURL('image/jpeg', 0.85);
        setMapSnapshot(dataUrl);
      }
    } catch {
      // Fall through to SVG fallback
    }
  }, []);

  // Measure the aspect-ratio container
  const roRef = useRef<ResizeObserver | null>(null);

  const measureRef = useCallback((node: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0];
      if (!r) return;
      setContainerW(r.contentRect.width);
      setContainerH(r.contentRect.height);
    });
    ro.observe(node);
    roRef.current = ro;
    setContainerW(node.offsetWidth);
    setContainerH(node.offsetHeight);
  }, []);

  useEffect(() => () => roRef.current?.disconnect(), []);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-black/30 rounded-xl overflow-hidden p-2">
      {/* Aspect-ratio box — position:relative is the Rnd bounds anchor */}
      <div
        ref={measureRef}
        className="relative w-full overflow-hidden rounded-lg shadow-2xl"
        style={{ aspectRatio: String(ratio) }}
      >
        {/* Background: live map snapshot or SVG fallback */}
        <div className="absolute inset-0">
          {mapSnapshot
            ? <img src={mapSnapshot} alt="" className="w-full h-full object-cover" draggable={false} />
            : <MapPreviewBackground />
          }
        </div>

        {/* Static watermark badge — fixed top-right, not draggable */}
        {containerW > 0 && containerH > 0 && (() => {
          const wm = overlays.find(o => o.kind === 'watermark');
          if (!wm || !wm.enabled) return null;
          return (
            <div
              className={cn(
                'absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-full select-none z-10 cursor-pointer transition-all',
                'bg-black/35',
                selectedId === wm.id ? 'ring-2 ring-primary' : 'ring-1 ring-white/20 hover:ring-white/40',
              )}
              onClick={() => onSelect(wm.id)}
            >
              <img
                src={`${import.meta.env.BASE_URL}logo.svg`}
                alt=""
                className="w-3.5 h-3.5 object-contain"
                draggable={false}
              />
              <span
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontWeight: 'bold',
                  fontSize: '10px',
                  color: '#ffffff',
                  textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                  whiteSpace: 'nowrap',
                }}
              >
                li'l Mappo
              </span>
            </div>
          );
        })()}

        {/* Overlay handles — reversed so index-0 paints on top (watermark excluded) */}
        {containerW > 0 && containerH > 0 && [...overlays].reverse()
          .filter(o => o.kind !== 'watermark')
          .map((overlay) => (
            <OverlayHandle
              key={overlay.id}
              overlay={overlay}
              isSelected={selectedId === overlay.id}
              onSelect={() => onSelect(overlay.id)}
              containerW={containerW}
              containerH={containerH}
            />
          ))}

        {/* Resolution label */}
        <div className="absolute bottom-1.5 left-2 text-[9px] font-mono text-white/30 select-none pointer-events-none">
          {resolution[0]} × {resolution[1]}
        </div>
      </div>
    </div>
  );
}

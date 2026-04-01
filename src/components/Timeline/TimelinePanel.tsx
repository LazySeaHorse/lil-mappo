import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import type { TimelineItem, CameraItem, RouteItem, BoundaryItem, CalloutItem } from '@/store/types';

const TRACK_HEIGHT = 32;
const RULER_HEIGHT = 24;
const PIXELS_PER_SECOND_DEFAULT = 60;
const KEYFRAME_SIZE = 12;

export default function TimelinePanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(PIXELS_PER_SECOND_DEFAULT);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [draggingPlayhead, setDraggingPlayhead] = useState(false);

  const {
    duration, playheadTime, setPlayheadTime, items, itemOrder,
    selectedItemId, selectItem, selectKeyframe, selectedKeyframeId,
    isPlaying,
  } = useProjectStore();

  const totalWidth = duration * pixelsPerSecond;

  const timeFromX = useCallback((x: number) => {
    return Math.max(0, Math.min(duration, (x + scrollLeft) / pixelsPerSecond));
  }, [scrollLeft, pixelsPerSecond, duration]);

  const handleRulerClick = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setPlayheadTime(timeFromX(x));
  }, [timeFromX, setPlayheadTime]);

  const handlePlayheadDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDraggingPlayhead(true);
    const handleMove = (ev: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      setPlayheadTime(timeFromX(x));
    };
    const handleUp = () => {
      setDraggingPlayhead(false);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [timeFromX, setPlayheadTime]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setPixelsPerSecond((prev) => Math.max(10, Math.min(300, prev - e.deltaY * 0.5)));
    } else if (e.shiftKey) {
      setScrollLeft((prev) => Math.max(0, prev + e.deltaY));
    }
  }, []);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        useProjectStore.getState().setIsPlaying(!useProjectStore.getState().isPlaying);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const playheadX = playheadTime * pixelsPerSecond - scrollLeft;

  const orderedItems = itemOrder.map((id) => items[id]).filter(Boolean);

  return (
    <div
      ref={containerRef}
      className="h-56 bg-timeline-bg border-t border-border flex flex-col shrink-0 select-none"
      onWheel={handleWheel}
    >
      {/* Time ruler */}
      <div
        className="h-6 border-b border-border relative cursor-pointer shrink-0 overflow-hidden"
        onClick={handleRulerClick}
        style={{ marginLeft: 120 }}
      >
        <svg width="100%" height={RULER_HEIGHT} className="absolute inset-0">
          {Array.from({ length: Math.ceil(duration / 0.5) + 1 }, (_, i) => {
            const t = i * 0.5;
            const x = t * pixelsPerSecond - scrollLeft;
            if (x < -20 || x > 2000) return null;
            const isMajor = t % 1 === 0;
            return (
              <g key={i}>
                <line x1={x} y1={isMajor ? 8 : 14} x2={x} y2={RULER_HEIGHT} stroke="hsl(var(--timeline-ruler))" strokeWidth={isMajor ? 1 : 0.5} opacity={isMajor ? 0.5 : 0.3} />
                {isMajor && (
                  <text x={x + 3} y={14} fontSize={9} fill="hsl(var(--timeline-ruler))" opacity={0.7} className="font-mono-time">
                    {Math.floor(t / 60)}:{(t % 60).toString().padStart(2, '0')}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Tracks */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden relative">
        {orderedItems.map((item) => (
          <TrackRow
            key={item.id}
            item={item}
            pixelsPerSecond={pixelsPerSecond}
            scrollLeft={scrollLeft}
            isSelected={selectedItemId === item.id}
            selectedKeyframeId={selectedKeyframeId}
            onSelect={() => selectItem(item.id)}
            onSelectKeyframe={selectKeyframe}
          />
        ))}

        {/* Playhead line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-playhead z-20 pointer-events-none"
          style={{ left: playheadX + 120 }}
        />
      </div>

      {/* Playhead scrubber at bottom */}
      <div className="h-6 border-t border-border flex items-center px-2 shrink-0">
        <span className="font-mono-time text-xs text-muted-foreground w-28 text-center">
          {formatTime(playheadTime)}
        </span>
        <div className="flex-1 relative h-4 mx-2 cursor-pointer" onMouseDown={handlePlayheadDrag}>
          <div className="absolute inset-y-1.5 left-0 right-0 bg-border rounded-full" />
          <div
            className="absolute top-0 w-3 h-4 bg-playhead rounded-sm -translate-x-1/2 cursor-ew-resize"
            style={{ left: `${(playheadTime / duration) * 100}%` }}
          />
        </div>
        <span className="font-mono-time text-xs text-muted-foreground w-28 text-right">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}

function TrackRow({
  item,
  pixelsPerSecond,
  scrollLeft,
  isSelected,
  selectedKeyframeId,
  onSelect,
  onSelectKeyframe,
}: {
  item: TimelineItem;
  pixelsPerSecond: number;
  scrollLeft: number;
  isSelected: boolean;
  selectedKeyframeId: string | null;
  onSelect: () => void;
  onSelectKeyframe: (id: string | null) => void;
}) {
  const colorClass = item.kind === 'route' ? 'bg-item-route' : item.kind === 'boundary' ? 'bg-item-boundary' : item.kind === 'callout' ? 'bg-item-callout' : 'bg-item-camera';
  const label = item.kind === 'camera'
    ? 'Camera'
    : item.kind === 'route'
      ? (item as RouteItem).name
      : item.kind === 'boundary'
        ? (item as BoundaryItem).placeName || 'Boundary'
        : (item as CalloutItem).title;

  return (
    <div
      className={`flex h-8 border-b border-border/50 cursor-pointer ${isSelected ? 'bg-selection-bg' : 'hover:bg-secondary/50'}`}
      onClick={onSelect}
    >
      {/* Label */}
      <div className="w-[120px] shrink-0 flex items-center px-2 gap-1.5 border-r border-border">
        <div className={`w-2 h-2 rounded-full ${colorClass}`} />
        <span className="text-xs truncate">{label}</span>
      </div>

      {/* Track content */}
      <div className="flex-1 relative overflow-hidden">
        {item.kind === 'camera' ? (
          // Camera keyframe diamonds
          (item as CameraItem).keyframes.map((kf) => {
            const x = kf.time * pixelsPerSecond - scrollLeft;
            return (
              <div
                key={kf.id}
                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer ${selectedKeyframeId === kf.id ? 'z-10' : ''}`}
                style={{ left: x }}
                onClick={(e) => { e.stopPropagation(); onSelect(); onSelectKeyframe(kf.id); }}
              >
                <div
                  className={`w-3 h-3 rotate-45 ${selectedKeyframeId === kf.id ? 'bg-primary ring-2 ring-primary/30' : 'bg-keyframe'}`}
                />
              </div>
            );
          })
        ) : (
          // Bar for routes, boundaries, callouts
          (() => {
            const startX = (item as any).startTime * pixelsPerSecond - scrollLeft;
            const endX = (item as any).endTime * pixelsPerSecond - scrollLeft;
            const width = endX - startX;
            return (
              <div
                className={`absolute top-1 bottom-1 rounded ${colorClass} opacity-60`}
                style={{ left: startX, width: Math.max(width, 4) }}
              />
            );
          })()
        )}
      </div>
    </div>
  );
}

function formatTime(s: number): string {
  const min = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 100);
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

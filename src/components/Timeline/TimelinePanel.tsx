import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import type { TimelineItem, CameraItem, RouteItem, BoundaryItem, CalloutItem } from '@/store/types';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useResponsive } from '@/hooks/useResponsive';

const RULER_HEIGHT = 32;
const PIXELS_PER_SECOND_DEFAULT = 60;

export default function TimelinePanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(PIXELS_PER_SECOND_DEFAULT);
  const [draggingPlayhead, setDraggingPlayhead] = useState(false);

  const {
    duration, playheadTime, setPlayheadTime, items, itemOrder,
    selectedItemId, selectItem, selectKeyframe, selectedKeyframeId,
    isInspectorOpen, timelineHeight, setTimelineHeight,
  } = useProjectStore();

  const { isMobile, isTablet } = useResponsive();

  const totalWidth = duration * pixelsPerSecond;

  const timeFromX = useCallback((x: number) => {
    return Math.max(0, Math.min(duration, x / pixelsPerSecond));
  }, [pixelsPerSecond, duration]);

  const orderedItems = itemOrder.map((id) => items[id]).filter(Boolean);
  const maxContentHeight = 32 + 32 + (orderedItems.length * 40) + 16; // Header + Ruler + Tracks + Padding

  const handleResizeDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = timelineHeight;

    const handleMove = (ev: MouseEvent) => {
      const deltaY = ev.clientY - startY; 
      // Negative delta means mouse moved UP (making panel taller)
      const upperLimit = Math.min(window.innerHeight - 150, maxContentHeight);
      const newHeight = Math.max(104, Math.min(upperLimit, startHeight - deltaY));
      setTimelineHeight(newHeight);
    };

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
    };

    document.body.style.cursor = 'row-resize';
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [timelineHeight, setTimelineHeight, maxContentHeight]);

  const handleRulerScrub = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDraggingPlayhead(true);
    
    // The scrubber zone's left edge is the true time=0 coordinate
    const rulerZone = e.currentTarget;
    
    const updateTimeFromMouse = (clientX: number) => {
      const rect = rulerZone.getBoundingClientRect();
      // rect.left dynamically accounts for scrolling perfectly
      const x = clientX - rect.left;
      setPlayheadTime(timeFromX(Math.max(0, x)));
    };

    updateTimeFromMouse(e.clientX);

    const handleMove = (ev: MouseEvent) => {
      updateTimeFromMouse(ev.clientX);
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

  const playheadX = playheadTime * pixelsPerSecond;
  
  // Provide auto-clamping in case tracks are deleted after we had expanded the panel
  const clampedHeight = Math.max(104, Math.min(timelineHeight, maxContentHeight));

  const rightMargin = !isInspectorOpen || isMobile ? 'right-4' : isTablet ? 'right-[304px]' : 'right-[350px]';
  const leftMargin = isMobile ? 'left-2' : 'left-4';

  // Hiding timeline on mobile when inspector is open to clear the gesture path
  if (isMobile && isInspectorOpen) return null;

  // Overriding mobile right margin to be more compact if we have the drawer handles
  const finalRightMargin = isMobile ? 'right-2' : rightMargin;
  const finalLeftMargin = isMobile ? 'left-2' : leftMargin;

  return (
    <div
      ref={containerRef}
      className={`absolute bottom-4 ${finalLeftMargin} ${finalRightMargin} bg-background/85 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl flex flex-col shrink-0 select-none pointer-events-auto overflow-hidden transition-all duration-300`}
      style={{ height: clampedHeight }}
    >
      {/* Top Resize Handle */}
      <div 
        className="absolute top-0 left-0 right-0 h-2 cursor-row-resize z-50 hover:bg-primary/20 transition-colors"
        onMouseDown={handleResizeDrag}
      />

      {/* Header Info */}
      <div className="h-8 border-b border-border/50 flex items-center justify-between px-4 shrink-0 bg-background/40 rounded-t-2xl">
        <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <span>Timeline</span>
          <span className="text-[9px] opacity-60 font-normal normal-case leading-none">(Drag gap to scale)</span>
        </span>
      </div>

      <ScrollArea className="flex-1 w-full relative group min-h-0">
        <div className="flex flex-col relative min-w-max pb-4" style={{ width: totalWidth + 160 + 20 }} onWheel={handleWheel}>
          
          {/* RULER ROW */}
          <div className="h-8 border-b border-border/50 relative shrink-0 bg-background/60 sticky top-0 z-30 backdrop-blur-md flex items-end">
            
            {/* White/Dead area above labels */}
            <div className="w-[160px] h-full bg-background/90 border-r border-border/50 shrink-0 sticky left-0 z-30 pointer-events-none" />
            
            {/* Scrubber active zone (starts tightly at time zero) */}
            <div 
              className="flex-1 relative h-full cursor-text" 
              onMouseDown={handleRulerScrub}
            >
              <svg width="100%" height={RULER_HEIGHT} className="absolute left-0 top-0 pointer-events-none">
                {Array.from({ length: Math.ceil(duration / 0.5) + 1 }, (_, i) => {
                  const t = i * 0.5;
                  const x = t * pixelsPerSecond;
                  const isMajor = t % 1 === 0;
                  return (
                    <g key={i}>
                      <line x1={x} y1={isMajor ? 12 : 20} x2={x} y2={RULER_HEIGHT} stroke="currentColor" strokeWidth={isMajor ? 1 : 0.5} className="text-muted-foreground opacity-40" />
                      {isMajor && (
                        <text x={x + 3} y={10} fontSize={10} className="fill-muted-foreground opacity-80 font-mono-time">
                          {Math.floor(t / 60)}:{(t % 60).toString().padStart(2, '0')}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* The "Protruding Head" of the Playhead sitting right on the ruler */}
              <div 
                className="absolute bottom-0 -translate-x-[5px] pointer-events-none transition-none z-10 drop-shadow-md"
                style={{ left: playheadX }}
              >
                {/* SVG Playhead Polygon (Classic Arrow down) */}
                <svg width="11" height="12" viewBox="0 0 11 12" className="text-primary fill-current">
                  <path d="M0 0 H11 V6 L5.5 12 L0 6 Z" />
                </svg>
              </div>
            </div>
          </div>

          {/* TRACKS CONTENT (Vertical scrolling tracks, playhead line cuts through) */}
          <div className="flex flex-col relative grow min-h-[100px] isolate">
            
            {/* Playhead Full Vertical Cut-Line */}
            <div 
              className="absolute top-0 bottom-0 w-px bg-primary z-20 pointer-events-none transition-none"
              style={{ left: playheadX + 160 }}
            />

            {orderedItems.map((item) => (
              <TrackRow
                key={item.id}
                item={item}
                pixelsPerSecond={pixelsPerSecond}
                isSelected={selectedItemId === item.id}
                selectedKeyframeId={selectedKeyframeId}
                onSelect={() => selectItem(item.id)}
                onSelectKeyframe={selectKeyframe}
              />
            ))}
          </div>

        </div>
        <ScrollBar orientation="horizontal" className="z-40 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <ScrollBar orientation="vertical" className="z-40 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </ScrollArea>
    </div>
  );
}

function TrackRow({
  item,
  pixelsPerSecond,
  isSelected,
  selectedKeyframeId,
  onSelect,
  onSelectKeyframe,
}: {
  item: TimelineItem;
  pixelsPerSecond: number;
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

  const handleKeyframeMouseDown = (e: React.MouseEvent, kfId: string, initialTime: number) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    onSelectKeyframe(kfId);

    const startX = e.clientX;
    const updateKeyframe = useProjectStore.getState().updateCameraKeyframe;
    const duration = useProjectStore.getState().duration;

    const handleMove = (ev: MouseEvent) => {
      const deltaX = ev.clientX - startX;
      const deltaTime = deltaX / pixelsPerSecond;
      const newTime = Math.max(0, Math.min(duration, initialTime + deltaTime));
      updateKeyframe(kfId, { time: newTime });
    };

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
    };

    document.body.style.cursor = 'ew-resize';
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  return (
    <div
      className={`flex h-10 border-b border-border/30 cursor-pointer group transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-secondary/40'}`}
      onClick={onSelect}
    >
      {/* Sticky Label Pane */}
      <div className={`w-[160px] shrink-0 sticky left-0 z-10 flex items-center px-4 gap-2.5 border-r border-border/50 bg-background/90 backdrop-blur-sm transition-colors ${isSelected ? 'border-l-2 border-l-primary' : 'border-l-2 border-l-transparent'}`}>
        <div className={`w-2 h-2 rounded-full ${colorClass} shadow-sm`} />
        <span className={`text-xs truncate font-medium ${isSelected ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>{label}</span>
      </div>

      {/* Track Content Area */}
      <div className="flex-1 relative">
        {item.kind === 'camera' ? (
          // Camera keyframes
          (item as CameraItem).keyframes.map((kf) => {
            const x = kf.time * pixelsPerSecond;
            return (
              <div
                key={kf.id}
                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer transition-transform ${selectedKeyframeId === kf.id ? 'z-20 scale-125' : 'hover:scale-110 z-10'} active:scale-95`}
                style={{ left: x }}
                onMouseDown={(e) => handleKeyframeMouseDown(e, kf.id, kf.time)}
                onClick={(e) => { e.stopPropagation(); onSelect(); onSelectKeyframe(kf.id); }}
              >
                <div
                  className={`w-3.5 h-3.5 rotate-45 rounded-[2px] shadow-sm border ${selectedKeyframeId === kf.id ? 'bg-primary border-primary ring-2 ring-primary/30 ring-offset-1 ring-offset-background' : 'bg-background border-primary'}`}
                />
              </div>
            );
          })
        ) : (
          <TimelineItemBar
            item={item as any}
            pixelsPerSecond={pixelsPerSecond}
            colorClass={colorClass}
            onSelect={onSelect}
          />
        )}
      </div>
    </div>
  );
}

function TimelineItemBar({
  item,
  pixelsPerSecond,
  colorClass,
  onSelect,
}: {
  item: RouteItem | BoundaryItem | CalloutItem;
  pixelsPerSecond: number;
  colorClass: string;
  onSelect: () => void;
}) {
  const updateItem = useProjectStore((s) => s.updateItem);
  const duration = useProjectStore((s) => s.duration);

  const handleMouseDown = (e: React.MouseEvent, type: 'start' | 'end' | 'move') => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();

    const startX = e.clientX;
    const initialStart = item.startTime;
    const initialEnd = item.endTime;
    const itemDuration = Math.max(0.1, initialEnd - initialStart);

    const handleMove = (ev: MouseEvent) => {
      const deltaX = ev.clientX - startX;
      const deltaTime = deltaX / pixelsPerSecond;

      if (type === 'start') {
        const newStart = Math.max(0, Math.min(initialEnd - 0.2, initialStart + deltaTime));
        updateItem(item.id, { startTime: newStart });
      } else if (type === 'end') {
        const newEnd = Math.max(initialStart + 0.2, Math.min(duration, initialEnd + deltaTime));
        updateItem(item.id, { endTime: newEnd });
      } else if (type === 'move') {
        let newStart = initialStart + deltaTime;
        if (newStart < 0) newStart = 0;
        if (newStart + itemDuration > duration) newStart = duration - itemDuration;
        
        updateItem(item.id, {
          startTime: newStart,
          endTime: newStart + itemDuration,
        });
      }
    };

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.classList.remove('cursor-grabbing', 'cursor-ew-resize');
    };

    document.body.classList.add(type === 'move' ? 'cursor-grabbing' : 'cursor-ew-resize');
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const startX = item.startTime * pixelsPerSecond;
  const endX = item.endTime * pixelsPerSecond;
  const width = endX - startX;

  return (
    <div
      className={`absolute top-2 bottom-2 ${colorClass} bg-opacity-40 backdrop-blur-[2px] rounded-md border border-white/20 shadow-[inset_0_1px_2px_rgba(255,255,255,0.15)] group flex items-stretch hover:shadow-md transition-shadow`}
      style={{ left: startX, width: Math.max(width, 4) }}
      onMouseDown={(e) => handleMouseDown(e, 'move')}
    >
      <div className={`absolute inset-0 ${colorClass} opacity-20 rounded-md pointer-events-none mix-blend-overlay`} />
      
      {/* Left Handle */}
      <div
        className="w-2.5 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10"
        onMouseDown={(e) => handleMouseDown(e, 'start')}
      >
        <div className="w-1 h-3.5 rounded-full bg-white/80 shadow-sm" />
      </div>
      
      <div className="flex-1 cursor-grab active:cursor-grabbing z-10" />

      {/* Right Handle */}
      <div
        className="w-2.5 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10"
        onMouseDown={(e) => handleMouseDown(e, 'end')}
      >
        <div className="w-1 h-3.5 rounded-full bg-white/80 shadow-sm" />
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

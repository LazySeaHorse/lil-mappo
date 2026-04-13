import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import type { TimelineItem, CameraItem, RouteItem, BoundaryItem, CalloutItem } from '@/store/types';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { IconButton } from '@/components/ui/icon-button';
import { useResponsive } from '@/hooks/useResponsive';
import {
  RIGHT_RESERVED_DESKTOP,
  RIGHT_RESERVED_TABLET,
  PANEL_MARGIN
} from '@/constants/layout';
import {
  SkipBack, SkipForward, ChevronLeft, ChevronRight,
  Play, Pause, Minus, Plus, Maximize2,
  Eye, EyeOff
} from 'lucide-react';

const RULER_HEIGHT = 40;
const HEADER_HEIGHT = 48;
const MIN_PANEL_HEIGHT = 120; // header + ruler + some visible content
const PIXELS_PER_SECOND_DEFAULT = 60;

function formatTime(s: number): string {
  const min = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 100);
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

export default function TimelinePanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(PIXELS_PER_SECOND_DEFAULT);
  const [draggingPlayhead, setDraggingPlayhead] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // --- Imperative playhead refs (no re-renders during playback) ---
  const rulerDiamondRef = useRef<HTMLDivElement>(null);
  const trackLineRef = useRef<HTMLDivElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);

  // Pixels-per-second is needed inside the subscription; use a ref to avoid stale closure
  const ppsRef = useRef(pixelsPerSecond);
  useEffect(() => { ppsRef.current = pixelsPerSecond; }, [pixelsPerSecond]);

  // Remove playheadTime from the destructure — subscribe imperatively below
  const {
    duration, setPlayheadTime, items, itemOrder,
    selectedItemId, selectItem, selectKeyframe, selectedKeyframeId,
    isInspectorOpen, timelineHeight, setTimelineHeight,
    isPlaying, setIsPlaying, fps, removeItem, setIsScrubbing
  } = useProjectStore();

  const [displayHeight, setDisplayHeight] = useState(timelineHeight);

  // Sync back from store if it changes elsewhere (e.g. loading a project)
  useEffect(() => {
    if (!isResizing) setDisplayHeight(timelineHeight);
  }, [timelineHeight, isResizing]);

  const { isMobile, isTablet } = useResponsive();

  const totalWidth = duration * pixelsPerSecond;

  const orderedItems = itemOrder.map((id) => items[id]).filter(Boolean);
  const maxContentHeight = HEADER_HEIGHT + RULER_HEIGHT + (orderedItems.length * 40) + 16;

  // --- Imperative playhead subscription: zero React re-renders during playback ---
  useEffect(() => {
    const unsub = useProjectStore.subscribe((state) => {
      const x = state.playheadTime * ppsRef.current;

      if (rulerDiamondRef.current) {
        rulerDiamondRef.current.style.left = `${x}px`;
      }
      if (trackLineRef.current) {
        // Track line left is x + 160 (the label column width)
        trackLineRef.current.style.left = `${x + 160}px`;
      }
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${formatTime(state.playheadTime)}`;
      }
    });
    return unsub;
  }, []); // mount-once

  // When pps changes, re-sync positions immediately from current store state
  useEffect(() => {
    const { playheadTime } = useProjectStore.getState();
    const x = playheadTime * pixelsPerSecond;
    if (rulerDiamondRef.current) rulerDiamondRef.current.style.left = `${x}px`;
    if (trackLineRef.current) trackLineRef.current.style.left = `${x + 160}px`;
    if (timeDisplayRef.current) timeDisplayRef.current.textContent = `${formatTime(playheadTime)}`;
  }, [pixelsPerSecond]);

  const timeFromX = useCallback((x: number) => {
    return Math.max(0, Math.min(duration, x / pixelsPerSecond));
  }, [pixelsPerSecond, duration]);

  // Use pointer capture so the ScrollArea can't steal the drag mid-way
  const handleResizeDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);

    const startY = e.clientY;
    const startHeight = containerRef.current?.offsetHeight ?? displayHeight;
    setIsResizing(true);

    let latestHeight = startHeight;

    const onMove = (ev: PointerEvent) => {
      const deltaY = ev.clientY - startY;
      const upperLimit = Math.min(window.innerHeight - 150, maxContentHeight);
      const newHeight = Math.floor(Math.max(MIN_PANEL_HEIGHT, Math.min(upperLimit, startHeight - deltaY)));
      latestHeight = newHeight;
      setDisplayHeight(newHeight);
    };

    const onUp = () => {
      el.releasePointerCapture(e.pointerId);
      setIsResizing(false);
      setTimelineHeight(latestHeight);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
    };

    document.body.style.cursor = 'row-resize';
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  }, [setTimelineHeight, maxContentHeight, displayHeight]);

  const handleRulerScrub = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDraggingPlayhead(true);
    setIsPlaying(false);
    setIsScrubbing(true);

    const rulerZone = e.currentTarget;

    const updateTimeFromMouse = (clientX: number) => {
      const rect = rulerZone.getBoundingClientRect();
      const x = clientX - rect.left;
      setPlayheadTime(timeFromX(Math.max(0, x)));
    };

    updateTimeFromMouse(e.clientX);

    const handleMove = (ev: MouseEvent) => updateTimeFromMouse(ev.clientX);

    const handleUp = () => {
      setDraggingPlayhead(false);
      setIsScrubbing(false);
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

  const handleFitToTimeline = useCallback(() => {
    if (!containerRef.current || duration <= 0) return;
    // Available width = panel width minus label column minus scrollbar padding
    const availableWidth = containerRef.current.offsetWidth - 160 - 24;
    setPixelsPerSecond(Math.max(10, Math.min(300, availableWidth / duration)));
  }, [duration]);

  // Global Keyboard Shortcuts — read playheadTime imperatively to avoid re-render cascade
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (isTyping) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          setIsPlaying(!isPlaying);
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedItemId && selectedItemId !== CAMERA_TRACK_ID) {
            removeItem(selectedItemId);
          }
          break;
        case 'BracketLeft':
          setPlayheadTime(0);
          break;
        case 'BracketRight':
          setPlayheadTime(duration);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          // Read imperatively — avoids including playheadTime in deps (which causes re-render cascade)
          setPlayheadTime(useProjectStore.getState().playheadTime - (1 / fps));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setPlayheadTime(useProjectStore.getState().playheadTime + (1 / fps));
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // playheadTime intentionally omitted — read via getState() to avoid re-render storm
  }, [isPlaying, setIsPlaying, selectedItemId, removeItem, setPlayheadTime, duration, fps]);

  // playheadX is only needed for initial render; live updates happen via imperative subscription
  const initialPlayheadX = useProjectStore.getState().playheadTime * pixelsPerSecond;

  const clampedHeight = Math.max(MIN_PANEL_HEIGHT, Math.min(displayHeight, maxContentHeight));

  const rightMarginVal = !isInspectorOpen || isMobile ? PANEL_MARGIN : isTablet ? RIGHT_RESERVED_TABLET : RIGHT_RESERVED_DESKTOP;
  const leftMarginVal = isMobile ? 8 : PANEL_MARGIN;

  if (isMobile && isInspectorOpen) return null;

  const finalRightMargin = isMobile ? '8px' : `${rightMarginVal}px`;
  const finalLeftMargin = isMobile ? '8px' : `${leftMarginVal}px`;

  return (
    <div
      ref={containerRef}
      className={`absolute ${isResizing ? 'bg-background/95' : 'backdrop-blur-xl'} bg-background/85 border border-border/50 rounded-2xl shadow-2xl flex flex-col shrink-0 select-none pointer-events-auto overflow-hidden transition-all duration-300`}
      style={{
        height: clampedHeight,
        bottom: `calc(${PANEL_MARGIN}px + env(safe-area-inset-bottom, 0px))`,
        left: finalLeftMargin,
        right: finalRightMargin
      }}
    >
      {/* Top Resize Handle */}
      <div
        className="absolute top-0 left-0 right-0 h-2 cursor-row-resize z-50 hover:bg-primary/20 transition-colors"
        onPointerDown={handleResizeDrag}
      />

      {/* Header: Timeline label (left) · Transport controls (center) · Zoom controls (right) */}
      <div
        className="border-b border-border/50 flex items-center px-3 shrink-0 bg-background/40 rounded-t-2xl relative"
        style={{ height: HEADER_HEIGHT }}
      >
        {/* Desktop: Label + Time / Mobile: Transport Controls */}
        {!isMobile ? (
          <div className="flex flex-col gap-0.5 shrink-0">
            <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground leading-none">
              Timeline
            </span>
            <span className="text-[10px] font-mono tabular-nums text-muted-foreground/70 leading-none">
              <span ref={timeDisplayRef}>{formatTime(useProjectStore.getState().playheadTime)}</span>
              <span className="opacity-50"> / {formatTime(duration)}</span>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-0.5">
            <TransportControls 
              setPlayheadTime={setPlayheadTime}
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
              duration={duration}
              fps={fps}
            />
          </div>
        )}

        {/* Desktop: Center transport controls absolutely */}
        {!isMobile && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-0.5 pointer-events-auto">
              <TransportControls 
                setPlayheadTime={setPlayheadTime}
                isPlaying={isPlaying}
                setIsPlaying={setIsPlaying}
                duration={duration}
                fps={fps}
              />
            </div>
          </div>
        )}

        {/* Right: zoom controls */}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <IconButton
            variant="ghost" size="xs"
            onClick={() => setPixelsPerSecond(p => Math.max(10, p - 15))}
            title="Zoom Out"
          >
            <Minus />
          </IconButton>
          <input
            type="range"
            min={10}
            max={300}
            value={pixelsPerSecond}
            onChange={e => setPixelsPerSecond(Number(e.target.value))}
            className="w-20 h-1 accent-primary cursor-pointer"
            title={`Zoom: ${Math.round(pixelsPerSecond)}px/s`}
          />
          <IconButton
            variant="ghost" size="xs"
            onClick={() => setPixelsPerSecond(p => Math.min(300, p + 15))}
            title="Zoom In"
          >
            <Plus />
          </IconButton>
          <IconButton
            variant="ghost" size="xs"
            onClick={handleFitToTimeline}
            title="Fit to Timeline"
          >
            <Maximize2 />
          </IconButton>
        </div>
      </div>

      <ScrollArea className="flex-1 w-full relative group min-h-0">
        <div className="flex flex-col relative min-w-max pb-4" style={{ width: totalWidth + 160 + 20 }} onWheel={handleWheel}>

          {/* RULER ROW */}
          <div className="h-10 border-b border-border/50 relative shrink-0 bg-background/60 sticky top-0 z-30 backdrop-blur-md flex items-end">

            <div className="w-[160px] h-full bg-background/90 border-r border-border/50 shrink-0 sticky left-0 z-30 pointer-events-none flex items-center px-4">
              {isMobile && (
                <span className="text-[10px] font-mono tabular-nums text-muted-foreground/70 leading-none">
                  <span ref={timeDisplayRef}>{formatTime(useProjectStore.getState().playheadTime)}</span>
                  <span className="opacity-50"> / {formatTime(duration)}</span>
                </span>
              )}
            </div>

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
                      <line x1={x} y1={isMajor ? 18 : 28} x2={x} y2={RULER_HEIGHT} stroke="currentColor" strokeWidth={isMajor ? 1 : 0.5} className="text-muted-foreground opacity-40" />
                      {isMajor && (
                        <text x={x + 3} y={14} fontSize={10} className="fill-muted-foreground opacity-80 font-mono-time">
                          {Math.floor(t / 60)}:{(t % 60).toString().padStart(2, '0')}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Ruler playhead diamond — positioned imperatively via ref */}
              <div
                ref={rulerDiamondRef}
                className="absolute bottom-0 -translate-x-[5px] pointer-events-none transition-none z-10 drop-shadow-md"
                style={{ left: initialPlayheadX }}
              >
                <svg width="11" height="12" viewBox="0 0 11 12" className="text-primary fill-current transition-transform duration-100 hover:scale-110">
                  <path d="M0 0 H11 V6 L5.5 12 L0 6 Z" />
                </svg>
              </div>
            </div>
          </div>

          {/* TRACKS */}
          <div className="flex flex-col relative grow min-h-[100px] isolate">

            {/* Track vertical playhead line — positioned imperatively via ref */}
            <div
              ref={trackLineRef}
              className="absolute top-0 bottom-0 w-px bg-primary z-20 pointer-events-none transition-none"
              style={{ left: initialPlayheadX + 160 }}
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

function TransportControls({ 
  setPlayheadTime, 
  isPlaying, 
  setIsPlaying, 
  duration, 
  fps 
}: { 
  setPlayheadTime: (t: number) => void; 
  isPlaying: boolean; 
  setIsPlaying: (p: boolean) => void;
  duration: number;
  fps: number;
}) {
  return (
    <>
      <IconButton
        variant="ghost" size="xs"
        onClick={() => setPlayheadTime(0)}
        title="Jump to Start ([)"
      >
        <SkipBack />
      </IconButton>
      <IconButton
        variant="ghost" size="xs"
        onClick={() => setPlayheadTime(Math.max(0, useProjectStore.getState().playheadTime - 1 / fps))}
        title="Step Back (←)"
      >
        <ChevronLeft />
      </IconButton>
      <IconButton
        variant="ghost" size="xs"
        onClick={() => setIsPlaying(!isPlaying)}
        title="Play / Pause (Space)"
        className={isPlaying ? 'text-primary' : ''}
      >
        {isPlaying ? <Pause /> : <Play />}
      </IconButton>
      <IconButton
        variant="ghost" size="xs"
        onClick={() => setPlayheadTime(Math.min(duration, useProjectStore.getState().playheadTime + 1 / fps))}
        title="Step Forward (→)"
      >
        <ChevronRight />
      </IconButton>
      <IconButton
        variant="ghost" size="xs"
        onClick={() => setPlayheadTime(duration)}
        title="Jump to End (])"
      >
        <SkipForward />
      </IconButton>
    </>
  );
}


const TrackRow = React.memo(({
  item,
  pixelsPerSecond,
  isSelected,
  selectedKeyframeId,
  onSelect,
  onSelectKeyframe,
}: {
  onSelect: () => void;
  onSelectKeyframe: (id: string | null) => void;
}) => {
  const isCameraEnabled = useProjectStore((s) => s.isCameraEnabled);
  const setIsCameraEnabled = useProjectStore((s) => s.setIsCameraEnabled);

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
      className={`flex h-10 border-b border-border/30 cursor-pointer group transition-all ${isSelected ? 'bg-primary/5' : 'hover:bg-secondary/40'} ${item.kind === 'camera' && !isCameraEnabled ? 'opacity-40 grayscale-[0.5]' : ''}`}
      onClick={onSelect}
    >
      <div className={`w-[160px] shrink-0 sticky left-0 z-10 flex items-center px-4 gap-2.5 border-r border-border/50 bg-background/90 backdrop-blur-sm transition-colors ${isSelected ? 'border-l-2 border-l-primary' : 'border-l-2 border-l-transparent'}`}>
        <div className={`w-2 h-2 rounded-full ${colorClass} shadow-sm`} />
        <span className={`text-xs truncate font-medium flex-1 ${isSelected ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>{label}</span>
        
        {item.kind === 'camera' && (
          <IconButton 
            variant="ghost" 
            size="xs" 
            className="h-6 w-6 opacity-0 group-hover:opacity-100 data-[enabled=false]:opacity-100 hover:text-primary transition-all"
            data-enabled={isCameraEnabled}
            onClick={(e) => {
              e.stopPropagation();
              setIsCameraEnabled(!isCameraEnabled);
            }}
          >
            {isCameraEnabled ? <Eye size={12} /> : <EyeOff size={12} className="text-destructive" />}
          </IconButton>
        )}
      </div>

      <div className="flex-1 relative">
        {item.kind === 'camera' ? (
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
});

const TimelineItemBar = React.memo(({
  item,
  pixelsPerSecond,
  colorClass,
  onSelect,
}: {
  item: RouteItem | BoundaryItem | CalloutItem;
  pixelsPerSecond: number;
  colorClass: string;
  onSelect: () => void;
}) => {
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

      <div
        className="w-2.5 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10"
        onMouseDown={(e) => handleMouseDown(e, 'start')}
      >
        <div className="w-1 h-3.5 rounded-full bg-white/80 shadow-sm" />
      </div>

      <div className="flex-1 cursor-grab active:cursor-grabbing z-10" />

      <div
        className="w-2.5 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10"
        onMouseDown={(e) => handleMouseDown(e, 'end')}
      >
        <div className="w-1 h-3.5 rounded-full bg-white/80 shadow-sm" />
      </div>
    </div>
  );
});

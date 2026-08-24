import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import type { RouteItem } from '@/store/types';
import TimelineHeader from './TimelineHeader';
import TimelineTrackRow, { type AutoCamBlock } from './TimelineTrackRow';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useResponsive } from '@/hooks/useResponsive';
import { formatTimelineTime } from './timelineTime';
import {
  RIGHT_RESERVED_DESKTOP,
  RIGHT_RESERVED_TABLET,
  PANEL_MARGIN
} from '@/constants/layout';
const RULER_HEIGHT = 40;
const HEADER_HEIGHT = 48;
const MIN_PANEL_HEIGHT = 120; // header + ruler + some visible content
const PIXELS_PER_SECOND_DEFAULT = 60;

export default function TimelinePanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(PIXELS_PER_SECOND_DEFAULT);
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
    isPlaying, setIsPlaying, fps, removeItem, setIsScrubbing,
    setSelectedAutoCamRouteId,
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

  const autoCamBlocks: AutoCamBlock[] = orderedItems
    .filter((i): i is RouteItem => i.kind === 'route' && !!(i as RouteItem).autoCam?.enabled)
    .map((r) => ({
      routeId: r.id,
      routeName: r.name,
      startTime: r.startTime,
      endTime: r.endTime,
    }));

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
        timeDisplayRef.current.textContent = formatTimelineTime(state.playheadTime);
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
    if (timeDisplayRef.current) timeDisplayRef.current.textContent = formatTimelineTime(playheadTime);
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
    setIsPlaying(false);
    setIsScrubbing(true);

    const rulerZone = e.currentTarget;

    const updateTimeFromMouse = (clientX: number) => {
      const rect = rulerZone.getBoundingClientRect();
      const x = clientX - rect.left;
      setPlayheadTime(timeFromX(x));
    };

    updateTimeFromMouse(e.clientX);

    const handleMove = (ev: MouseEvent) => updateTimeFromMouse(ev.clientX);

    const handleUp = () => {
      setIsScrubbing(false);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [timeFromX, setPlayheadTime, setIsPlaying, setIsScrubbing]);

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
      data-testid="timeline-panel"
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

      <TimelineHeader
        duration={duration}
        fps={fps}
        isMobile={isMobile}
        isPlaying={isPlaying}
        pixelsPerSecond={pixelsPerSecond}
        setIsPlaying={setIsPlaying}
        setPixelsPerSecond={setPixelsPerSecond}
        setPlayheadTime={setPlayheadTime}
        timeDisplayRef={timeDisplayRef}
        onFitToTimeline={handleFitToTimeline}
      />

      <ScrollArea className="flex-1 w-full relative group min-h-0">
        <div className="flex flex-col relative min-w-max pb-4" style={{ width: totalWidth + 160 + 20 }} onWheel={handleWheel}>

          {/* RULER ROW */}
          <div className="h-10 border-b border-border/50 relative shrink-0 bg-background/60 sticky top-0 z-30 backdrop-blur-md flex items-end">

            <div className="w-[160px] h-full bg-background/90 border-r border-border/50 shrink-0 sticky left-0 z-30 pointer-events-none flex items-center px-4">
              {isMobile && (
                <span className="text-[10px] font-mono tabular-nums text-muted-foreground/70 leading-none">
                  <span ref={timeDisplayRef}>{formatTimelineTime(useProjectStore.getState().playheadTime)}</span>
                  <span className="opacity-50"> / {formatTimelineTime(duration)}</span>
                </span>
              )}
            </div>

            <div
              data-testid="timeline-ruler"
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
              <TimelineTrackRow
                key={item.id}
                item={item}
                pixelsPerSecond={pixelsPerSecond}
                isSelected={selectedItemId === item.id}
                selectedKeyframeId={selectedKeyframeId}
                onSelect={() => selectItem(item.id)}
                onSelectKeyframe={selectKeyframe}
                autoCamBlocks={item.kind === 'camera' ? autoCamBlocks : undefined}
                onSelectAutoCam={(routeId) => {
                  selectItem(routeId);
                  setSelectedAutoCamRouteId(routeId);
                }}
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

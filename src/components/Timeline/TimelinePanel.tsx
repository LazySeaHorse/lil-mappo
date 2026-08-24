import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import type { RouteItem } from '@/store/types';
import TimelineHeader from './TimelineHeader';
import TimelineViewport from './TimelineViewport';
import type { AutoCamBlock } from './TimelineTrackRow';
import { useResponsive } from '@/hooks/useResponsive';
import { formatTimelineTime } from './timelineTime';
import {
  RIGHT_RESERVED_DESKTOP,
  RIGHT_RESERVED_TABLET,
  PANEL_MARGIN
} from '@/constants/layout';
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

  const orderedItems = itemOrder.map((id) => items[id]).filter(Boolean);
  const maxContentHeight = HEADER_HEIGHT + 40 + (orderedItems.length * 40) + 16;

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

      <TimelineViewport
        autoCamBlocks={autoCamBlocks}
        duration={duration}
        isMobile={isMobile}
        items={orderedItems}
        pixelsPerSecond={pixelsPerSecond}
        rulerDiamondRef={rulerDiamondRef}
        selectedItemId={selectedItemId}
        selectedKeyframeId={selectedKeyframeId}
        setIsPlaying={setIsPlaying}
        setIsScrubbing={setIsScrubbing}
        setPixelsPerSecond={setPixelsPerSecond}
        setPlayheadTime={setPlayheadTime}
        timeDisplayRef={timeDisplayRef}
        trackLineRef={trackLineRef}
        onSelectItem={selectItem}
        onSelectAutoCam={(routeId) => {
          selectItem(routeId);
          setSelectedAutoCamRouteId(routeId);
        }}
        onSelectKeyframe={selectKeyframe}
      />
    </div>
  );
}

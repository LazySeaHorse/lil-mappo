import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '@/store/useProjectStore';
import type { RouteItem } from '@/store/types';
import TimelineHeader from './TimelineHeader';
import TimelineViewport from './TimelineViewport';
import type { AutoCamBlock } from './TimelineTrackRow';
import { useResponsive } from '@/hooks/useResponsive';
import { useTimelineKeyboardShortcuts } from './useTimelineKeyboardShortcuts';
import { useTimelinePlayheadSync } from './useTimelinePlayheadSync';
import { clampZoom, fitZoom, zoomBounds as getZoomBounds } from './timelineZoom';
import {
  RIGHT_RESERVED_DESKTOP,
  RIGHT_RESERVED_TABLET,
  PANEL_MARGIN,
  TIMELINE_MIN_HEIGHT as MIN_PANEL_HEIGHT,
  timelineContentHeight,
  visibleTimelineHeight,
} from '@/constants/layout';
const PIXELS_PER_SECOND_DEFAULT = 60;

export default function TimelinePanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(PIXELS_PER_SECOND_DEFAULT);
  const [isResizing, setIsResizing] = useState(false);
  const [panelWidth, setPanelWidth] = useState(0);

  const {
    duration, setPlayheadTime, items, itemOrder,
    selectedItemId, selectItem, selectKeyframe, selectedKeyframeId,
    isInspectorOpen, timelineHeight, setTimelineHeight,
    isPlaying, setIsPlaying, fps, removeItem, setIsScrubbing,
    setSelectedAutoCamRouteId,
  } = useProjectStore(useShallow((state) => ({
    duration: state.duration,
    setPlayheadTime: state.setPlayheadTime,
    items: state.items,
    itemOrder: state.itemOrder,
    selectedItemId: state.selectedItemId,
    selectItem: state.selectItem,
    selectKeyframe: state.selectKeyframe,
    selectedKeyframeId: state.selectedKeyframeId,
    isInspectorOpen: state.isInspectorOpen,
    timelineHeight: state.timelineHeight,
    setTimelineHeight: state.setTimelineHeight,
    isPlaying: state.isPlaying,
    setIsPlaying: state.setIsPlaying,
    fps: state.fps,
    removeItem: state.removeItem,
    setIsScrubbing: state.setIsScrubbing,
    setSelectedAutoCamRouteId: state.setSelectedAutoCamRouteId,
  })));

  const { rulerDiamondRef, timeDisplayRef, trackLineRef } = useTimelinePlayheadSync(pixelsPerSecond);

  const [displayHeight, setDisplayHeight] = useState(timelineHeight);

  // Sync back from store if it changes elsewhere (e.g. loading a project)
  useEffect(() => {
    if (!isResizing) setDisplayHeight(timelineHeight);
  }, [timelineHeight, isResizing]);

  const { isMobile, isTablet } = useResponsive();

  const orderedItems = useMemo(
    () => itemOrder.map((id) => items[id]).filter(Boolean),
    [itemOrder, items],
  );
  const maxContentHeight = timelineContentHeight(orderedItems.length);

  const autoCamBlocks: AutoCamBlock[] = useMemo(() => orderedItems
    .filter((item): item is RouteItem => item.kind === 'route' && !!item.autoCam?.enabled)
    .map((route) => ({
      routeId: route.id,
      routeName: route.name,
      startTime: route.startTime,
      endTime: route.endTime,
    })), [orderedItems]);

  const resizeDragRef = useRef<{
    startY: number;
    startHeight: number;
    latestHeight: number;
  } | null>(null);

  const handleResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);

    const startHeight = containerRef.current?.offsetHeight || displayHeight;
    setIsResizing(true);
    resizeDragRef.current = {
      startY: e.clientY,
      startHeight,
      latestHeight: startHeight,
    };
  }, [displayHeight]);

  const handleResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = resizeDragRef.current;
    if (!drag) return;
    const deltaY = e.clientY - drag.startY;
    const availableWindowHeight = window.innerHeight > 0 ? window.innerHeight : 900;
    const upperLimit = Math.min(availableWindowHeight - 150, maxContentHeight);
    const newHeight = Math.floor(Math.max(MIN_PANEL_HEIGHT, Math.min(upperLimit, drag.startHeight - deltaY)));
    drag.latestHeight = newHeight;
    setDisplayHeight(newHeight);
  }, [maxContentHeight]);

  const handleResizePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = resizeDragRef.current;
    if (drag) {
      setIsResizing(false);
      setTimelineHeight(drag.latestHeight);
      resizeDragRef.current = null;
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  }, [setTimelineHeight]);

  const handleResizeLostPointerCapture = useCallback(() => {
    const drag = resizeDragRef.current;
    if (drag) {
      setIsResizing(false);
      setTimelineHeight(drag.latestHeight);
      resizeDragRef.current = null;
    }
  }, [setTimelineHeight]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => setPanelWidth(container.offsetWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Zoomed all the way out is the whole project fitting the panel.
  const zoomBounds = useMemo(
    () => getZoomBounds(fitZoom(panelWidth, duration), fps),
    [panelWidth, duration, fps],
  );
  useEffect(() => {
    setPixelsPerSecond((value) => clampZoom(value, zoomBounds));
  }, [zoomBounds]);

  const handleFitToTimeline = useCallback(() => setPixelsPerSecond(zoomBounds.min), [zoomBounds]);

  useTimelineKeyboardShortcuts({
    duration,
    fps,
    isPlaying,
    selectedItemId,
    removeItem,
    setIsPlaying,
    setPlayheadTime,
  });

  const handleSelectAutoCam = useCallback((routeId: string) => {
    selectItem(routeId);
    setSelectedAutoCamRouteId(routeId);
  }, [selectItem, setSelectedAutoCamRouteId]);

  const clampedHeight = visibleTimelineHeight(displayHeight, orderedItems.length);

  const rightMarginVal = !isInspectorOpen || isMobile ? PANEL_MARGIN : isTablet ? RIGHT_RESERVED_TABLET : RIGHT_RESERVED_DESKTOP;
  const leftMarginVal = isMobile ? 8 : PANEL_MARGIN;

  if (isMobile && isInspectorOpen) return null;

  const finalRightMargin = isMobile ? '8px' : `${rightMarginVal}px`;
  const finalLeftMargin = isMobile ? '8px' : `${leftMarginVal}px`;

  return (
    <div
      ref={containerRef}
      data-testid="timeline-panel"
      data-walkthrough="timeline-panel"
      data-ph-unmask
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
        data-testid="timeline-resize-handle"
        className="absolute top-0 left-0 right-0 h-2 cursor-row-resize z-50 hover:bg-primary/20 transition-colors touch-none"
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        onPointerCancel={handleResizePointerUp}
        onLostPointerCapture={handleResizeLostPointerCapture}
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
        zoomBounds={zoomBounds}
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
        zoomBounds={zoomBounds}
        onSelectItem={selectItem}
        onSelectAutoCam={handleSelectAutoCam}
        onSelectKeyframe={selectKeyframe}
      />
    </div>
  );
}

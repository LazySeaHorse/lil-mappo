import React from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import type { BoundaryItem, CalloutItem, RouteItem } from '@/store/types';
import {
  constrainEndTrim,
  constrainMove,
  constrainStartTrim,
  getOtherAutoCamRanges,
} from './timelineConstraints';

const MIN_TIMELINE_ITEM_DURATION = 0.2;

interface TimelineItemBarProps {
  item: RouteItem | BoundaryItem | CalloutItem;
  pixelsPerSecond: number;
  colorClass: string;
  onSelect: () => void;
}

const TimelineItemBar = React.memo(({
  item,
  pixelsPerSecond,
  colorClass,
  onSelect,
}: TimelineItemBarProps) => {
  const updateItem = useProjectStore((state) => state.updateItem);
  const duration = useProjectStore((state) => state.duration);

  const dragStateRef = React.useRef<{
    type: 'start' | 'end' | 'move';
    startX: number;
    initialStart: number;
    initialEnd: number;
    itemDuration: number;
    isAutoCamConstrained: boolean;
    blockedRanges: ReturnType<typeof getOtherAutoCamRanges>;
  } | null>(null);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>, type: 'start' | 'end' | 'move') => {
    event.stopPropagation();
    event.preventDefault();
    onSelect();

    event.currentTarget.setPointerCapture?.(event.pointerId);

    const initialStart = item.startTime;
    const initialEnd = item.endTime;
    const itemDuration = Math.max(0.1, initialEnd - initialStart);
    const currentItem = useProjectStore.getState().items[item.id];
    const isAutoCamConstrained = currentItem?.kind === 'route' && currentItem.autoCam?.enabled;
    const blockedRanges = isAutoCamConstrained
      ? getOtherAutoCamRanges(Object.values(useProjectStore.getState().items), item.id)
      : [];

    dragStateRef.current = {
      type,
      startX: event.clientX,
      initialStart,
      initialEnd,
      itemDuration,
      isAutoCamConstrained: Boolean(isAutoCamConstrained),
      blockedRanges,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state) return;

    const deltaX = event.clientX - state.startX;
    const deltaTime = deltaX / pixelsPerSecond;

    if (state.type === 'start') {
      const newStart = Math.max(0, Math.min(state.initialEnd - MIN_TIMELINE_ITEM_DURATION, state.initialStart + deltaTime));
      const constrainedStart = state.isAutoCamConstrained
        ? constrainStartTrim(newStart, state.initialEnd, state.blockedRanges, MIN_TIMELINE_ITEM_DURATION)
        : newStart;
      if (constrainedStart !== null) updateItem(item.id, { startTime: constrainedStart });
    } else if (state.type === 'end') {
      const newEnd = Math.max(state.initialStart + MIN_TIMELINE_ITEM_DURATION, Math.min(duration, state.initialEnd + deltaTime));
      const constrainedEnd = state.isAutoCamConstrained
        ? constrainEndTrim(state.initialStart, newEnd, state.blockedRanges, MIN_TIMELINE_ITEM_DURATION, duration)
        : newEnd;
      if (constrainedEnd !== null) updateItem(item.id, { endTime: constrainedEnd });
    } else {
      const newStart = Math.max(0, Math.min(duration - state.itemDuration, state.initialStart + deltaTime));
      const constrainedRange = state.isAutoCamConstrained
        ? constrainMove(newStart, state.itemDuration, state.blockedRanges, duration)
        : { startTime: newStart, endTime: newStart + state.itemDuration };
      if (!constrainedRange) return;
      updateItem(item.id, constrainedRange);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current) {
      dragStateRef.current = null;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  };

  const handleLostPointerCapture = () => {
    dragStateRef.current = null;
  };

  const startX = item.startTime * pixelsPerSecond;
  const endX = item.endTime * pixelsPerSecond;

  return (
    <div
      data-testid={`timeline-item-${item.id}`}
      className={`absolute top-2 bottom-2 ${colorClass} bg-opacity-40 backdrop-blur-[2px] rounded-md border border-white/20 shadow-[inset_0_1px_2px_rgba(255,255,255,0.15)] group flex items-stretch hover:shadow-md transition-shadow select-none touch-none`}
      style={{ left: startX, width: Math.max(endX - startX, 4) }}
      onPointerDown={(event) => handlePointerDown(event, 'move')}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onLostPointerCapture={handleLostPointerCapture}
    >
      <div className={`absolute inset-0 ${colorClass} opacity-20 rounded-md pointer-events-none mix-blend-overlay`} />

      <div
        data-testid={`timeline-item-${item.id}-start-handle`}
        className="w-2.5 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10 touch-none"
        onPointerDown={(event) => handlePointerDown(event, 'start')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onLostPointerCapture={handleLostPointerCapture}
      >
        <div className="w-1 h-3.5 rounded-full bg-white/80 shadow-sm pointer-events-none" />
      </div>

      <div className="flex-1 cursor-grab active:cursor-grabbing z-10" />

      <div
        data-testid={`timeline-item-${item.id}-end-handle`}
        className="w-2.5 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10 touch-none"
        onPointerDown={(event) => handlePointerDown(event, 'end')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onLostPointerCapture={handleLostPointerCapture}
      >
        <div className="w-1 h-3.5 rounded-full bg-white/80 shadow-sm pointer-events-none" />
      </div>
    </div>
  );
});

TimelineItemBar.displayName = 'TimelineItemBar';

export default TimelineItemBar;

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

  const handleMouseDown = (event: React.MouseEvent, type: 'start' | 'end' | 'move') => {
    event.stopPropagation();
    event.preventDefault();
    onSelect();

    const startX = event.clientX;
    const initialStart = item.startTime;
    const initialEnd = item.endTime;
    const itemDuration = Math.max(0.1, initialEnd - initialStart);
    const currentItem = useProjectStore.getState().items[item.id];
    const isAutoCamConstrained = currentItem?.kind === 'route' && currentItem.autoCam?.enabled;
    const blockedRanges = isAutoCamConstrained
      ? getOtherAutoCamRanges(Object.values(useProjectStore.getState().items), item.id)
      : [];

    const handleMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaTime = deltaX / pixelsPerSecond;

      if (type === 'start') {
        const newStart = Math.max(0, Math.min(initialEnd - MIN_TIMELINE_ITEM_DURATION, initialStart + deltaTime));
        const constrainedStart = isAutoCamConstrained
          ? constrainStartTrim(newStart, initialEnd, blockedRanges, MIN_TIMELINE_ITEM_DURATION)
          : newStart;
        if (constrainedStart !== null) updateItem(item.id, { startTime: constrainedStart });
      } else if (type === 'end') {
        const newEnd = Math.max(initialStart + MIN_TIMELINE_ITEM_DURATION, Math.min(duration, initialEnd + deltaTime));
        const constrainedEnd = isAutoCamConstrained
          ? constrainEndTrim(initialStart, newEnd, blockedRanges, MIN_TIMELINE_ITEM_DURATION, duration)
          : newEnd;
        if (constrainedEnd !== null) updateItem(item.id, { endTime: constrainedEnd });
      } else {
        const newStart = Math.max(0, Math.min(duration - itemDuration, initialStart + deltaTime));
        const constrainedRange = isAutoCamConstrained
          ? constrainMove(newStart, itemDuration, blockedRanges, duration)
          : { startTime: newStart, endTime: newStart + itemDuration };
        if (!constrainedRange) return;
        updateItem(item.id, constrainedRange);
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

  return (
    <div
      data-testid={`timeline-item-${item.id}`}
      className={`absolute top-2 bottom-2 ${colorClass} bg-opacity-40 backdrop-blur-[2px] rounded-md border border-white/20 shadow-[inset_0_1px_2px_rgba(255,255,255,0.15)] group flex items-stretch hover:shadow-md transition-shadow`}
      style={{ left: startX, width: Math.max(endX - startX, 4) }}
      onMouseDown={(event) => handleMouseDown(event, 'move')}
    >
      <div className={`absolute inset-0 ${colorClass} opacity-20 rounded-md pointer-events-none mix-blend-overlay`} />

      <div
        data-testid={`timeline-item-${item.id}-start-handle`}
        className="w-2.5 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10"
        onMouseDown={(event) => handleMouseDown(event, 'start')}
      >
        <div className="w-1 h-3.5 rounded-full bg-white/80 shadow-sm" />
      </div>

      <div className="flex-1 cursor-grab active:cursor-grabbing z-10" />

      <div
        data-testid={`timeline-item-${item.id}-end-handle`}
        className="w-2.5 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10"
        onMouseDown={(event) => handleMouseDown(event, 'end')}
      >
        <div className="w-1 h-3.5 rounded-full bg-white/80 shadow-sm" />
      </div>
    </div>
  );
});

TimelineItemBar.displayName = 'TimelineItemBar';

export default TimelineItemBar;

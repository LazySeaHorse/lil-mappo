import React from 'react';
import { AlertTriangle, FileWarning } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import type { BoundaryItem, CalloutItem, ModelItem, RouteItem, TimelineItem } from '@/store/types';
import { useModelStatus } from '@/models/modelRegistry';
import { MODEL_TERMS } from '@/models/modelTerms';
import { TIMELINE_LANE_HEIGHT } from '@/constants/layout';
import {
  constrainEndTrim,
  constrainGroupMove,
  constrainStartTrim,
  getOtherAutoCamRanges,
  type MovingClip,
} from './timelineConstraints';
import { timelineItemLabel } from './timelineItemLabel';
import { nearestSnap, SNAP_PIXELS, snapMove, snapTimes } from './timelineSnap';
import type { TimelineDragHandlers } from './useTimelineLanes';

const MIN_TIMELINE_ITEM_DURATION = 0.2;
/** Space above and below a clip inside its lane. */
const CLIP_INSET = 8;

type ClipItem = RouteItem | BoundaryItem | CalloutItem | ModelItem;

const COLOR_CLASS: Record<ClipItem['kind'], string> = {
  route: 'bg-item-route',
  boundary: 'bg-item-boundary',
  callout: 'bg-item-callout',
  model: 'bg-teal-500',
};

interface TimelineItemBarProps {
  item: ClipItem;
  lane: number;
  pixelsPerSecond: number;
  isSelected: boolean;
  onSelect: (itemId: string) => void;
  onToggleSelect: (itemId: string) => void;
  drag: TimelineDragHandlers;
}

const TimelineItemBar = React.memo(({
  item,
  lane,
  pixelsPerSecond,
  isSelected,
  onSelect,
  onToggleSelect,
  drag,
}: TimelineItemBarProps) => {
  const updateItem = useProjectStore((state) => state.updateItem);
  const updateItems = useProjectStore((state) => state.updateItems);
  const duration = useProjectStore((state) => state.duration);
  const colorClass = COLOR_CLASS[item.kind];
  const label = timelineItemLabel(item);

  const dragStateRef = React.useRef<{
    type: 'start' | 'end' | 'move';
    startX: number;
    startY: number;
    initialStart: number;
    initialEnd: number;
    itemDuration: number;
    laneOffset: number;
    snapTimes: number[];
    isAutoCamConstrained: boolean;
    blockedRanges: ReturnType<typeof getOtherAutoCamRanges>;
    /** The clips a move carries: this one, or every selected clip when it is one of several. */
    moving: (MovingClip & { id: string })[];
  } | null>(null);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // A press on an edge handle trims that edge; anywhere else on the clip moves it.
    const handle = (event.target as Element).closest<HTMLElement>('[data-handle]');
    const type = handle && event.currentTarget.contains(handle) ? (handle.dataset.handle as 'start' | 'end') : 'move';
    event.stopPropagation();
    event.preventDefault();
    // Shift or Ctrl/Cmd adds the clip to the selection, or takes it out, without starting a drag.
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      onToggleSelect(item.id);
      return;
    }

    const state = useProjectStore.getState();
    // Moving one of several selected clips moves them all; an edge handle trims only the clip it is on.
    const movesSelection = type === 'move' && state.selectedItemIds.length > 1 && state.selectedItemIds.includes(item.id);
    if (!movesSelection) onSelect(item.id);

    event.currentTarget.setPointerCapture?.(event.pointerId);

    const movedIds = new Set(movesSelection ? state.selectedItemIds : [item.id]);
    const moving = [...movedIds].flatMap((id) => {
      const clip = state.items[id];
      if (!clip || clip.kind === 'camera') return [];
      return [{
        id,
        startTime: clip.startTime,
        endTime: clip.endTime,
        blockedRanges: isAutoCamRoute(clip) ? getOtherAutoCamRanges(Object.values(state.items), movedIds) : [],
      }];
    });
    const own = moving.find((clip) => clip.id === item.id);
    const initialStart = item.startTime;
    const initialEnd = item.endTime;
    const itemDuration = Math.max(0.1, initialEnd - initialStart);

    dragStateRef.current = {
      type,
      startX: event.clientX,
      startY: event.clientY,
      initialStart,
      initialEnd,
      itemDuration,
      laneOffset: 0,
      snapTimes: snapTimes(state, { itemIds: movedIds }),
      isAutoCamConstrained: isAutoCamRoute(state.items[item.id]),
      blockedRanges: own?.blockedRanges ?? [],
      moving,
    };
    drag.begin(item.id);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state) return;

    const deltaTime = (event.clientX - state.startX) / pixelsPerSecond;
    const tolerance = SNAP_PIXELS / pixelsPerSecond;

    if (state.type === 'start') {
      const proposed = state.initialStart + deltaTime;
      const snapped = nearestSnap(proposed, state.snapTimes, tolerance);
      const newStart = Math.max(0, Math.min(state.initialEnd - MIN_TIMELINE_ITEM_DURATION, snapped ?? proposed));
      const constrainedStart = state.isAutoCamConstrained
        ? constrainStartTrim(newStart, state.initialEnd, state.blockedRanges, MIN_TIMELINE_ITEM_DURATION)
        : newStart;
      drag.showSnap(constrainedStart === snapped ? snapped : null);
      if (constrainedStart !== null) updateItem(item.id, { startTime: constrainedStart });
    } else if (state.type === 'end') {
      const proposed = state.initialEnd + deltaTime;
      const snapped = nearestSnap(proposed, state.snapTimes, tolerance);
      const newEnd = Math.max(state.initialStart + MIN_TIMELINE_ITEM_DURATION, Math.min(duration, snapped ?? proposed));
      const constrainedEnd = state.isAutoCamConstrained
        ? constrainEndTrim(state.initialStart, newEnd, state.blockedRanges, MIN_TIMELINE_ITEM_DURATION, duration)
        : newEnd;
      drag.showSnap(constrainedEnd === snapped ? snapped : null);
      if (constrainedEnd !== null) updateItem(item.id, { endTime: constrainedEnd });
    } else {
      const snap = snapMove(state.initialStart + deltaTime, state.itemDuration, state.snapTimes, tolerance);
      const proposedDelta = snap.startTime - state.initialStart;
      const delta = constrainGroupMove(proposedDelta, state.moving, duration);
      drag.showSnap(delta === proposedDelta ? snap.snappedTo : null);

      // A single clip can change lanes; moving several stays in the lanes they have. `|| 0` turns
      // NaN (a pointer event without a clientY) and -0 into no move.
      const laneOffset = state.moving.length === 1
        ? Math.round((event.clientY - state.startY) / TIMELINE_LANE_HEIGHT) || 0
        : 0;
      if (laneOffset !== state.laneOffset) {
        state.laneOffset = laneOffset;
        drag.moveLanes(laneOffset);
      }
      if (delta === null) return;
      updateItems(Object.fromEntries(state.moving.map((clip) => [
        clip.id,
        { startTime: clip.startTime + delta, endTime: clip.endTime + delta },
      ])));
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current) {
      dragStateRef.current = null;
      drag.end();
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  };

  const handleLostPointerCapture = () => {
    if (dragStateRef.current) {
      dragStateRef.current = null;
      drag.end();
    }
  };

  const startX = item.startTime * pixelsPerSecond;
  const endX = item.endTime * pixelsPerSecond;
  const handleClass = `w-2.5 shrink-0 cursor-ew-resize transition-opacity flex items-center justify-center z-10 touch-none ${isSelected ? 'opacity-100' : 'opacity-0 group-hover/clip:opacity-100'}`;

  return (
    <div
      data-testid={`timeline-item-${item.id}`}
      data-agent-item={item.id}
      data-lane={lane}
      data-selected={isSelected}
      title={label}
      className={`absolute pointer-events-auto ${colorClass} bg-opacity-40 backdrop-blur-[2px] rounded-md border border-white/20 shadow-[inset_0_1px_2px_rgba(255,255,255,0.15)] group/clip flex items-stretch overflow-hidden hover:shadow-md transition-[top,box-shadow] duration-150 select-none touch-none ${isSelected ? 'ring-2 ring-primary ring-offset-1 ring-offset-background z-10' : ''}`}
      style={{
        left: startX,
        width: Math.max(endX - startX, 4),
        top: lane * TIMELINE_LANE_HEIGHT + CLIP_INSET,
        height: TIMELINE_LANE_HEIGHT - CLIP_INSET * 2,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onLostPointerCapture={handleLostPointerCapture}
    >
      <div className={`absolute inset-0 ${colorClass} opacity-20 rounded-md pointer-events-none mix-blend-overlay`} />

      <div
        data-testid={`timeline-item-${item.id}-start-handle`}
        data-handle="start"
        className={handleClass}
      >
        <div className="w-1 h-3.5 rounded-full bg-white/80 shadow-sm pointer-events-none" />
      </div>

      <div className="flex-1 min-w-0 flex items-center gap-1 cursor-grab active:cursor-grabbing z-10">
        <span className="text-2xs font-medium text-white truncate pointer-events-none ph-mask">
          {label}
        </span>
        {item.kind === 'model' && <ModelFileMark assetId={item.assetId} />}
      </div>

      <div
        data-testid={`timeline-item-${item.id}-end-handle`}
        data-handle="end"
        className={handleClass}
      >
        <div className="w-1 h-3.5 rounded-full bg-white/80 shadow-sm pointer-events-none" />
      </div>
    </div>
  );
});

/** A warning on a placed model's clip while its file is missing, or an error when it failed to load. */
function ModelFileMark({ assetId }: { assetId: string }) {
  const asset = useProjectStore((s) => s.models[assetId]);
  const status = useModelStatus(asset);
  if (status === 'ready') return null;
  const failed = status === 'failed';
  const label = failed ? MODEL_TERMS.failedTitle : MODEL_TERMS.missingTitle;
  return (
    <span role="img" aria-label={label} title={label} className={`shrink-0 ${failed ? 'text-destructive' : 'text-amber-500'}`}>
      {failed ? <AlertTriangle size={12} aria-hidden="true" /> : <FileWarning size={12} aria-hidden="true" />}
    </span>
  );
}

function isAutoCamRoute(item: TimelineItem | undefined): boolean {
  return item?.kind === 'route' && Boolean(item.autoCam?.enabled);
}

TimelineItemBar.displayName = 'TimelineItemBar';

export default TimelineItemBar;

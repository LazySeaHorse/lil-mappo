import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { TIMELINE_LANE_HEIGHT } from '@/constants/layout';
import { TIMELINE_GROUP_TERMS } from '@/lib/terms';
import type { GroupBlock } from '@/store/timelineLanes';
import type { TimelineItem } from '@/store/types';
import { useProjectStore } from '@/store/useProjectStore';
import { constrainGroupMove, movingClips, type MovingClip } from './timelineConstraints';
import { SNAP_PIXELS, snapMove, snapTimes } from './timelineSnap';
import type { TimelineDragHandlers } from './useTimelineLanes';

/** Space above and below the bar inside its lane, as for a clip. */
const BAR_INSET = 8;

interface BarDrag {
  startX: number;
  initialStart: number;
  span: number;
  snapTimes: number[];
  moving: (MovingClip & { id: string })[];
}

/** A collapsed group: one bar from its first clip's start to its last clip's end. Dragging it moves them all. */
export default function TimelineGroupBar({
  block,
  items,
  pixelsPerSecond,
  isSelected,
  drag,
}: {
  block: GroupBlock;
  items: Record<string, TimelineItem>;
  pixelsPerSecond: number;
  isSelected: boolean;
  drag: TimelineDragHandlers;
}) {
  const dragRef = useRef<BarDrag | null>(null);
  const members = block.memberIds.flatMap((id) => {
    const item = items[id];
    return item && item.kind !== 'camera' ? [item] : [];
  });
  const startTime = Math.min(...members.map((member) => member.startTime));
  const endTime = Math.max(...members.map((member) => member.endTime));
  const label = TIMELINE_GROUP_TERMS.clipCount(members.length);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    const state = useProjectStore.getState();
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      state.selectItems([...state.selectedItemIds, ...block.memberIds]);
      return;
    }
    state.selectItems(block.memberIds);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const ids = new Set(block.memberIds);
    dragRef.current = {
      startX: event.clientX,
      initialStart: startTime,
      span: Math.max(0.1, endTime - startTime),
      snapTimes: snapTimes(state, { itemIds: ids }),
      moving: movingClips(state.items, ids, 'move'),
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = dragRef.current;
    if (!current) return;
    const deltaTime = (event.clientX - current.startX) / pixelsPerSecond;
    const snap = snapMove(current.initialStart + deltaTime, current.span, current.snapTimes, SNAP_PIXELS / pixelsPerSecond);
    const proposedDelta = snap.startTime - current.initialStart;
    const { duration, updateItems } = useProjectStore.getState();
    const delta = constrainGroupMove(proposedDelta, current.moving, duration);
    drag.showSnap(delta === proposedDelta ? snap.snappedTo : null);
    if (delta === null) return;
    updateItems(Object.fromEntries(current.moving.map((clip) => [
      clip.id,
      { startTime: clip.startTime + delta, endTime: clip.endTime + delta },
    ])));
  };

  const endDrag = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    drag.end();
    if (event?.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  if (members.length === 0) return null;
  const left = startTime * pixelsPerSecond;

  return (
    <div
      data-testid={`timeline-group-${block.groupId}`}
      data-selected={isSelected}
      title={label}
      className={`absolute pointer-events-auto flex items-center overflow-hidden rounded-md border px-2 cursor-grab active:cursor-grabbing select-none touch-none hover:shadow-md ${isSelected ? 'ring-2 ring-primary ring-offset-1 ring-offset-background z-10' : ''}`}
      style={{
        left,
        width: Math.max(endTime * pixelsPerSecond - left, 4),
        top: block.firstLane * TIMELINE_LANE_HEIGHT + BAR_INSET,
        height: TIMELINE_LANE_HEIGHT - BAR_INSET * 2,
        backgroundColor: block.color,
        borderColor: 'rgba(255, 255, 255, 0.2)',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={() => endDrag()}
    >
      <span className="truncate text-2xs font-medium text-white pointer-events-none">{label}</span>
    </div>
  );
}

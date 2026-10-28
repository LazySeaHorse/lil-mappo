import { useCallback, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { orderForLane, packLanes } from '@/store/timelineLanes';
import type { TimelineItem } from '@/store/types';

interface LaneDrag {
  itemId: string;
  /** The lanes as they were when the drag began, held still so nothing jumps under the pointer. */
  lanes: string[][];
  order: string[];
  from: number;
  to: number;
}

export interface TimelineDragHandlers {
  /** A clip was pressed: hold the lanes still until the drag ends. */
  begin: (itemId: string) => void;
  /** The clip being moved is now this many lanes below (or above, when negative) where it began. */
  moveLanes: (offset: number) => void;
  /** Shows the snap guide at a time, or hides it with null. */
  showSnap: (time: number | null) => void;
  end: () => void;
}

/**
 * The lanes the timeline draws, and dragging clips between them. While a clip is dragged the
 * lanes stay as they were except for that clip, which shows in the lane it is over; moving it
 * to another lane rewrites itemOrder there and then, so the whole drag is one undo step, and
 * the lanes are packed again from the new order when it ends.
 */
export function useTimelineLanes(orderedItems: TimelineItem[]) {
  const packed = useMemo(() => packLanes(orderedItems), [orderedItems]);
  const packedRef = useRef(packed);
  packedRef.current = packed;

  const dragRef = useRef<LaneDrag | null>(null);
  const [drag, setDrag] = useState<LaneDrag | null>(null);
  const [snapTime, setSnapTime] = useState<number | null>(null);

  const update = (next: LaneDrag | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  const begin = useCallback((itemId: string) => {
    const lanes = packedRef.current;
    const from = lanes.findIndex((ids) => ids.includes(itemId));
    if (from < 0) return;
    update({ itemId, lanes, order: useProjectStore.getState().itemOrder, from, to: from });
  }, []);

  const moveLanes = useCallback((offset: number) => {
    const current = dragRef.current;
    if (!current) return;
    // One past the last lane starts a new one, unless the clip already sits alone at the bottom.
    const aloneAtBottom = current.from === current.lanes.length - 1 && current.lanes[current.from].length === 1;
    const to = Math.max(0, Math.min(current.lanes.length - (aloneAtBottom ? 1 : 0), current.from + offset));
    if (to === current.to) return;
    update({ ...current, to });

    const order = to === current.from
      ? current.order
      : orderForLane(current.order, current.lanes, current.itemId, to);
    const { itemOrder, reorderItems } = useProjectStore.getState();
    if (order.some((id, index) => id !== itemOrder[index])) reorderItems(order);
  }, []);

  const end = useCallback(() => {
    if (dragRef.current) update(null);
    setSnapTime(null);
  }, []);

  const handlers = useMemo<TimelineDragHandlers>(
    () => ({ begin, moveLanes, showSnap: setSnapTime, end }),
    [begin, moveLanes, end],
  );

  const lanes = useMemo(() => (drag ? withClipInLane(drag) : packed), [drag, packed]);

  return { lanes, snapTime, handlers };
}

function withClipInLane({ lanes, itemId, from, to }: LaneDrag): string[][] {
  if (from === to) return lanes;
  const moved = lanes.map((ids) => ids.filter((id) => id !== itemId));
  if (to === moved.length) moved.push([]);
  moved[to] = [...moved[to], itemId];
  return moved;
}

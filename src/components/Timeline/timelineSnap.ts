import type { TimelineItem } from '@/store/types';

/** How close, in pixels, a dragged edge or camera view comes to something before it snaps to it. */
export const SNAP_PIXELS = 8;

interface SnapSource {
  items: Record<string, TimelineItem>;
  duration: number;
  playheadTime: number;
}

/**
 * Times a timeline drag snaps to: the start and end of the video, the playhead, every item's
 * start and end, and the camera views. Leaves out whatever is being dragged.
 */
export function snapTimes(
  { items, duration, playheadTime }: SnapSource,
  dragged: { itemId?: string; keyframeId?: string },
): number[] {
  const times = [0, duration, playheadTime];
  for (const item of Object.values(items)) {
    if (item.kind === 'camera') {
      for (const keyframe of item.keyframes) {
        if (keyframe.id !== dragged.keyframeId) times.push(keyframe.time);
      }
    } else if (item.id !== dragged.itemId) {
      times.push(item.startTime, item.endTime);
    }
  }
  return times;
}

/** The snap time nearest `time` and no further than `tolerance` from it, or null. */
export function nearestSnap(time: number, times: readonly number[], tolerance: number): number | null {
  let nearest: number | null = null;
  for (const candidate of times) {
    const distance = Math.abs(candidate - time);
    if (distance <= tolerance && (nearest === null || distance < Math.abs(nearest - time))) nearest = candidate;
  }
  return nearest;
}

/**
 * Snaps a clip being moved: whichever of its start or end is nearer a snap time lands on it.
 * Returns the new start and the time snapped to, which is null when nothing was close enough.
 */
export function snapMove(
  startTime: number,
  length: number,
  times: readonly number[],
  tolerance: number,
): { startTime: number; snappedTo: number | null } {
  const start = nearestSnap(startTime, times, tolerance);
  const end = nearestSnap(startTime + length, times, tolerance);
  const startDistance = start === null ? Infinity : Math.abs(start - startTime);
  const endDistance = end === null ? Infinity : Math.abs(end - (startTime + length));
  if (start !== null && startDistance <= endDistance) return { startTime: start, snappedTo: start };
  if (end !== null) return { startTime: end - length, snappedTo: end };
  return { startTime, snappedTo: null };
}

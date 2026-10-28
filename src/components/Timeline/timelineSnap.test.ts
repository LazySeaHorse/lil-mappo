import { describe, expect, it } from 'vitest';
import type { TimelineItem } from '@/store/types';
import { nearestSnap, snapMove, snapTimes } from './timelineSnap';

const items = {
  'camera-track': { kind: 'camera', id: 'camera-track', keyframes: [{ id: 'k1', time: 1.5 }, { id: 'k2', time: 7 }] },
  a: { kind: 'route', id: 'a', startTime: 2, endTime: 4 },
  b: { kind: 'callout', id: 'b', startTime: 5, endTime: 6 },
} as unknown as Record<string, TimelineItem>;

describe('snapTimes', () => {
  it('collects the ends of the video, the playhead, item edges and camera views, less what is dragged', () => {
    expect(snapTimes({ items, duration: 10, playheadTime: 3 }, { itemId: 'a' }).sort((x, y) => x - y))
      .toEqual([0, 1.5, 3, 5, 6, 7, 10]);
    expect(snapTimes({ items, duration: 10, playheadTime: 3 }, { keyframeId: 'k2' }).sort((x, y) => x - y))
      .toEqual([0, 1.5, 2, 3, 4, 5, 6, 10]);
  });
});

describe('nearestSnap', () => {
  it('picks the nearest time within the tolerance', () => {
    expect(nearestSnap(4.9, [4, 5, 6], 0.2)).toBe(5);
    expect(nearestSnap(4.5, [4, 5], 0.2)).toBeNull();
  });
});

describe('snapMove', () => {
  it('lands whichever edge is nearer a snap time', () => {
    expect(snapMove(2.2, 2, [2, 4.25], 0.25)).toEqual({ startTime: 2.25, snappedTo: 4.25 });
    expect(snapMove(2.1, 2, [2, 4.5], 0.2)).toEqual({ startTime: 2, snappedTo: 2 });
    expect(snapMove(3, 2, [0, 10], 0.2)).toEqual({ startTime: 3, snappedTo: null });
  });
});

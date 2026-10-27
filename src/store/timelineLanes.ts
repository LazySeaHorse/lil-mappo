import type { CameraItem, TimelineItem } from './types';

type Clip = Exclude<TimelineItem, CameraItem>;

/**
 * The timeline shows the camera in its own lane and packs every other item into lanes under it.
 * itemOrder is the stacking order (later draws on top), and an item sits in the highest lane
 * below every earlier item it overlaps in time. Items that never overlap share a lane, and
 * wherever items do overlap, lower lanes draw on top.
 */
export function packLanes(items: readonly TimelineItem[]): string[][] {
  const lanes: string[][] = [];
  const placed: { item: Clip; lane: number }[] = [];
  for (const item of items) {
    if (item.kind === 'camera') continue;
    const lane = placed.reduce(
      (lowest, other) => (overlapsInTime(other.item, item) ? Math.max(lowest, other.lane + 1) : lowest),
      0,
    );
    placed.push({ item, lane });
    (lanes[lane] ??= []).push(item.id);
  }
  return lanes;
}

function overlapsInTime(a: Clip, b: Clip): boolean {
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

/** How many lanes the timeline shows: the camera's and the packed ones under it. */
export function timelineLaneCount(items: Record<string, TimelineItem>, itemOrder: readonly string[]): number {
  return 1 + packLanes(itemOrder.map((id) => items[id]).filter(Boolean)).length;
}

/**
 * The itemOrder that drops `itemId` into `lane` of `lanes`, a layout from packLanes. `lane` may be
 * one past the last to start a new lane at the bottom. Moved up, the item goes over the clips in
 * that lane; moved down, under them, the way a list reorders. Packing the new order then puts it
 * in that lane where it overlaps something there, and lifts it as high as it fits where it does
 * not. The camera keeps its place.
 */
export function orderForLane(
  itemOrder: readonly string[],
  lanes: readonly string[][],
  itemId: string,
  lane: number,
): string[] {
  const inOrder = new Set(itemOrder);
  const from = lanes.findIndex((ids) => ids.includes(itemId));
  const cut = lane > from ? lane + 1 : lane;
  const rest = lanes.map((ids) => ids.filter((id) => id !== itemId && inOrder.has(id)));
  const packed = [...rest.slice(0, cut).flat(), itemId, ...rest.slice(cut).flat()];
  const slots = new Set(packed);
  let next = 0;
  return itemOrder.map((id) => (slots.has(id) ? packed[next++] : id));
}

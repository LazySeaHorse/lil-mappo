import type { CameraItem, Project, TimelineItem } from './types';

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

export type TimelineGrouping = Pick<Project, 'groups' | 'collapsedGroupIds'>;

const NO_GROUPS: TimelineGrouping = { groups: {}, collapsedGroupIds: [] };

/** A group's lanes on the timeline. A collapsed group holds one lane, drawn as one bar. */
export interface GroupBlock {
  groupId: string;
  color: string;
  firstLane: number;
  laneCount: number;
  collapsed: boolean;
  memberIds: string[];
}

export interface TimelineLayout {
  lanes: string[][];
  blocks: GroupBlock[];
}

/**
 * The lanes with groups in them. Each group packs into its own block of lanes, at the place of its
 * first clip in `items`, and the clips around it pack as usual on either side, so nothing shares a
 * lane with a group. A collapsed group's lane still lists its clips, for reordering around it.
 */
export function layoutLanes(items: readonly TimelineItem[], { groups, collapsedGroupIds }: TimelineGrouping): TimelineLayout {
  const groupIdOf = new Map(Object.values(groups).flatMap((group) => group.itemIds.map((id) => [id, group.id] as const)));
  const clips = items.filter((item): item is Clip => item.kind !== 'camera');
  const segments: { groupId: string | null; clips: Clip[] }[] = [];
  const placedGroups = new Set<string>();

  for (const clip of clips) {
    const groupId = groupIdOf.get(clip.id) ?? null;
    if (groupId === null) {
      const last = segments[segments.length - 1];
      if (last?.groupId === null) last.clips.push(clip);
      else segments.push({ groupId: null, clips: [clip] });
    } else if (!placedGroups.has(groupId)) {
      placedGroups.add(groupId);
      segments.push({ groupId, clips: clips.filter((other) => groupIdOf.get(other.id) === groupId) });
    }
  }

  const lanes: string[][] = [];
  const blocks: GroupBlock[] = [];
  for (const segment of segments) {
    const collapsed = segment.groupId !== null && collapsedGroupIds.includes(segment.groupId);
    const packed = collapsed ? [segment.clips.map((clip) => clip.id)] : packLanes(segment.clips);
    if (segment.groupId !== null) {
      blocks.push({
        groupId: segment.groupId,
        color: groups[segment.groupId].color,
        firstLane: lanes.length,
        laneCount: packed.length,
        collapsed,
        memberIds: segment.clips.map((clip) => clip.id),
      });
    }
    lanes.push(...packed);
  }
  return { lanes, blocks };
}

/**
 * The lane a dragged clip can really go to. A group's clips stay in its block, and any other clip
 * goes past a block rather than into it: to its far side, the way it was heading.
 */
export function droppableLane(blocks: readonly GroupBlock[], itemId: string, from: number, to: number): number {
  const own = blocks.find((block) => block.memberIds.includes(itemId));
  if (own) return Math.max(own.firstLane, Math.min(own.firstLane + own.laneCount - 1, to));
  const entered = blocks.find((block) => to >= block.firstLane && to < block.firstLane + block.laneCount);
  if (!entered) return to;
  return to > from ? entered.firstLane + entered.laneCount - 1 : entered.firstLane;
}

let lastCount: (TimelineGrouping & { items: Record<string, TimelineItem>; itemOrder: readonly string[]; count: number }) | null = null;

/**
 * How many lanes the timeline shows: the camera's and the packed ones under it. Store selectors
 * call this on every store write (each playhead tick), so the last answer is kept and reused
 * while what it depends on is the same objects.
 */
export function timelineLaneCount(
  items: Record<string, TimelineItem>,
  itemOrder: readonly string[],
  { groups, collapsedGroupIds }: TimelineGrouping = NO_GROUPS,
): number {
  if (
    lastCount?.items === items && lastCount.itemOrder === itemOrder
    && lastCount.groups === groups && lastCount.collapsedGroupIds === collapsedGroupIds
  ) return lastCount.count;
  const grouping = { groups, collapsedGroupIds };
  const count = 1 + layoutLanes(itemOrder.map((id) => items[id]).filter(Boolean), grouping).lanes.length;
  lastCount = { items, itemOrder, ...grouping, count };
  return count;
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

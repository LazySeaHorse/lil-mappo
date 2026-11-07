import type { RouteItem, TimelineItem } from '@/store/types';

export interface TimeRange {
  startTime: number;
  endTime: number;
}

/** The time ranges of the auto-camera routes that are not in `excludedIds` (the clips being edited). */
export function getOtherAutoCamRanges(
  items: Iterable<TimelineItem>,
  excludedIds: ReadonlySet<string>,
): TimeRange[] {
  return Array.from(items)
    .filter(
      (item): item is RouteItem =>
        !excludedIds.has(item.id) &&
        item.kind === 'route' &&
        item.autoCam?.enabled,
    )
    .map(({ startTime, endTime }) => ({ startTime, endTime }));
}

function overlaps(startTime: number, endTime: number, range: TimeRange): boolean {
  return startTime < range.endTime && endTime > range.startTime;
}

function containsTime(time: number, range: TimeRange): boolean {
  return time > range.startTime && time < range.endTime;
}

export function constrainStartTrim(
  proposedStart: number,
  fixedEnd: number,
  blockedRanges: TimeRange[],
  minimumDuration: number,
): number | null {
  if (blockedRanges.some((range) => containsTime(fixedEnd, range))) return null;

  const latestBlockedEnd = blockedRanges.reduce(
    (latest, range) =>
      range.startTime < fixedEnd && range.endTime <= fixedEnd
        ? Math.max(latest, range.endTime)
        : latest,
    0,
  );

  return Math.min(fixedEnd - minimumDuration, Math.max(proposedStart, latestBlockedEnd));
}

export function constrainEndTrim(
  fixedStart: number,
  proposedEnd: number,
  blockedRanges: TimeRange[],
  minimumDuration: number,
  timelineDuration: number,
): number | null {
  if (blockedRanges.some((range) => containsTime(fixedStart, range))) return null;

  const earliestBlockedStart = blockedRanges.reduce(
    (earliest, range) =>
      range.endTime > fixedStart && range.startTime >= fixedStart
        ? Math.min(earliest, range.startTime)
        : earliest,
    timelineDuration,
  );

  return Math.max(fixedStart + minimumDuration, Math.min(proposedEnd, earliestBlockedStart));
}

/** A clip being moved, with the ranges it may not overlap. */
export interface MovingClip extends TimeRange {
  blockedRanges: TimeRange[];
}

/**
 * The offset to move every clip by: the one nearest `proposedDelta` that keeps all of them inside
 * the video and out of their blocked ranges, or null when none fits. The clips move together, so
 * they keep their places relative to each other.
 */
export function constrainGroupMove(
  proposedDelta: number,
  clips: readonly MovingClip[],
  timelineDuration: number,
): number | null {
  if (clips.length === 0) return null;
  const lowest = 0 - Math.min(...clips.map((clip) => clip.startTime));
  const highest = timelineDuration - Math.max(...clips.map((clip) => clip.endTime));
  if (highest < lowest) return null;

  const clamp = (delta: number) => Math.max(lowest, Math.min(highest, delta));
  const target = clamp(proposedDelta);
  const candidates = new Set<number>([target, lowest, highest]);
  for (const clip of clips) {
    for (const range of clip.blockedRanges) {
      candidates.add(clamp(range.endTime - clip.startTime));
      candidates.add(clamp(range.startTime - clip.endTime));
    }
  }

  const fits = (delta: number) =>
    clips.every((clip) =>
      clip.blockedRanges.every((range) => !overlaps(clip.startTime + delta, clip.endTime + delta, range)),
    );
  return Array.from(candidates)
    .filter(fits)
    .sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0] ?? null;
}

export function constrainMove(
  proposedStart: number,
  itemDuration: number,
  blockedRanges: TimeRange[],
  timelineDuration: number,
): TimeRange | null {
  const clip = { startTime: 0, endTime: itemDuration, blockedRanges };
  const startTime = constrainGroupMove(proposedStart, [clip], timelineDuration);
  return startTime === null ? null : { startTime, endTime: startTime + itemDuration };
}

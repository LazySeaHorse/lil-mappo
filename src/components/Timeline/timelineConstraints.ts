import type { RouteItem, TimelineItem } from '@/store/types';

export interface TimeRange {
  startTime: number;
  endTime: number;
}

export function getOtherAutoCamRanges(
  items: Iterable<TimelineItem>,
  currentItemId: string,
): TimeRange[] {
  return Array.from(items)
    .filter(
      (item): item is RouteItem =>
        item.id !== currentItemId &&
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

export function constrainMove(
  proposedStart: number,
  itemDuration: number,
  blockedRanges: TimeRange[],
  timelineDuration: number,
): TimeRange | null {
  const maximumStart = timelineDuration - itemDuration;
  if (maximumStart < 0) return null;

  const clampStart = (startTime: number) => Math.max(0, Math.min(maximumStart, startTime));
  const candidates = new Set<number>([
    clampStart(proposedStart),
    0,
    maximumStart,
  ]);

  for (const range of blockedRanges) {
    candidates.add(clampStart(range.endTime));
    candidates.add(clampStart(range.startTime - itemDuration));
  }

  const nearestStart = Array.from(candidates)
    .filter((startTime) =>
      blockedRanges.every((range) => !overlaps(startTime, startTime + itemDuration, range)),
    )
    .sort((a, b) => Math.abs(a - proposedStart) - Math.abs(b - proposedStart))[0];

  return nearestStart === undefined
    ? null
    : { startTime: nearestStart, endTime: nearestStart + itemDuration };
}

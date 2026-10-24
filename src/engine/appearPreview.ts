import type { TimelineItem } from '@/store/types';

/**
 * An appear preview plays the entrance of items just added, sped up and a few times
 * over, then leaves them finished, like an animated sticker. It draws through the real
 * renderers with its own clock in place of the playhead, so it looks exactly like the
 * video. It lasts while the selection and playhead stay where they were when it
 * started; playing, exporting or hiding the UI also ends it.
 */
export const APPEAR_PREVIEW_TIMING = {
  /** How long one play of the entrance takes, however long it is on the timeline. */
  playMs: 1200,
  /** The pause on the finished state before it plays again. */
  holdMs: 600,
  plays: 3,
} as const;

export interface AppearPreview {
  itemIds: readonly string[];
  /** `performance.now()` when it started; -Infinity when it starts finished (reduced motion). */
  startedAt: number;
  /** The selection it started with. A change ends the preview. */
  selectedItemId: string | null;
  /** The playhead it started at. A change ends the preview. */
  playheadTime: number;
}

/** What an appear preview draws at one moment. */
export interface AppearPreviewFrame {
  itemIds: ReadonlySet<string>;
  /** The timeline time to draw its items at. */
  time: number;
  /** It has played out and shows its items finished: there is nothing left to animate. */
  done: boolean;
}

type PreviewState = {
  appearPreview: AppearPreview | null;
  items: Record<string, TimelineItem>;
  selectedItemId: string | null;
  playheadTime: number;
  isPlaying: boolean;
  isExporting: boolean;
  hideUI: boolean;
};

type TimedItem = Exclude<TimelineItem, { kind: 'camera' }>;

/** When an item's entrance is over: a callout or model enters over its enter duration, a route or boundary over its whole clip. */
export function entranceEnd(item: TimedItem): number {
  return 'transition' in item ? Math.min(item.startTime + item.transition.enterDuration, item.endTime) : item.endTime;
}

/** How far (0 to 1) through the entrance an appear preview is `elapsedMs` after it started, and whether it has played out. */
export function appearPreviewProgress(elapsedMs: number): { progress: number; done: boolean } {
  const { playMs, holdMs, plays } = APPEAR_PREVIEW_TIMING;
  const loopMs = playMs + holdMs;
  // The last play ends on the finished state, with no pause after it.
  if (!(elapsedMs < plays * loopMs - holdMs)) return { progress: 1, done: true };
  return { progress: Math.min(1, (Math.max(0, elapsedMs) % loopMs) / playMs), done: false };
}

/**
 * The appear preview the live editor draws at `now`, or null when there is none. Items
 * that start later than others (spokes of a hub) keep their stagger: the preview plays
 * the whole span from the first start to the last entrance end.
 */
export function activeAppearPreview(state: PreviewState, now: number): AppearPreviewFrame | null {
  const preview = state.appearPreview;
  if (!preview || state.isPlaying || state.isExporting || state.hideUI) return null;
  if (state.selectedItemId !== preview.selectedItemId || state.playheadTime !== preview.playheadTime) return null;

  const items = preview.itemIds
    .map((id) => state.items[id])
    .filter((item): item is TimedItem => !!item && item.kind !== 'camera');
  if (items.length === 0) return null;
  const from = Math.min(...items.map((item) => item.startTime));
  const to = Math.max(...items.map(entranceEnd));

  const { progress, done } = appearPreviewProgress(now - preview.startedAt);
  return { itemIds: new Set(items.map((item) => item.id)), time: from + progress * (to - from), done };
}

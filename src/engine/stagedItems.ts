import type { TimelineItem } from '@/store/types';

/**
 * Staged items are what an Add panel shows before the user adds it: the real renderers
 * draw them on the map like project items, finished, but they are not in the project,
 * its timeline, its undo history or its saves. Adding moves them into the project;
 * closing the panel drops them. The video never shows them: they are hidden while
 * exporting or capturing, and with the UI hidden.
 */

/** An item that can be staged: anything on the timeline but the camera. */
export type StagedItem = Exclude<TimelineItem, { kind: 'camera' }>;

/**
 * The Add panel that staged the items. Only one panel stages at a time; a panel reads, adds
 * and clears only what it staged itself, so one panel closing never drops another's preview.
 */
export type StagingOwner = 'boundary-add' | 'callout-add';

const NOTHING_STAGED: readonly StagedItem[] = [];

/** The items `owner` staged, or none when another panel (or nothing) has staged. */
export function stagedItemsOf(
  state: { stagedItems: readonly StagedItem[]; stagedBy: StagingOwner | null },
  owner: StagingOwner,
): readonly StagedItem[] {
  return state.stagedBy === owner ? state.stagedItems : NOTHING_STAGED;
}

type SceneState = {
  items: Record<string, TimelineItem>;
  itemOrder: string[];
  stagedItems: readonly StagedItem[];
  isExporting: boolean;
  isCapturingViewport: boolean;
  hideUI: boolean;
};

/** What the live editor draws: the project's items, then the staged ones on top. */
export interface SceneItems {
  items: Record<string, TimelineItem>;
  itemOrder: string[];
  /** Ids of the staged items among them. */
  staged: ReadonlySet<string>;
}

const NONE: ReadonlySet<string> = new Set();

/** The last scene built for each staged list, so the same inputs give the same objects. */
const built = new WeakMap<readonly StagedItem[], { from: SceneState['items']; order: string[]; scene: SceneItems }>();

/** Whether the editor shows staged items now. */
export function showsStagedItems(state: SceneState): boolean {
  return state.stagedItems.length > 0 && !state.isExporting && !state.isCapturingViewport && !state.hideUI;
}

/**
 * The items the live editor draws. Without staged items on show these are the project's
 * own `items` and `itemOrder`, so callers can tell a change by identity either way.
 */
export function sceneItems(state: SceneState): SceneItems {
  if (!showsStagedItems(state)) return { items: state.items, itemOrder: state.itemOrder, staged: NONE };
  const cached = built.get(state.stagedItems);
  if (cached && cached.from === state.items && cached.order === state.itemOrder) return cached.scene;

  const items = { ...state.items };
  const itemOrder = [...state.itemOrder];
  for (const item of state.stagedItems) {
    items[item.id] = item;
    itemOrder.push(item.id);
  }
  const scene = { items, itemOrder, staged: new Set(state.stagedItems.map((item) => item.id)) };
  built.set(state.stagedItems, { from: state.items, order: state.itemOrder, scene });
  return scene;
}

/** Staged items moved in time so the first starts at `time`, keeping their spacing. */
export function stagedAt(staged: readonly StagedItem[], time: number): StagedItem[] {
  if (staged.length === 0) return [];
  const shift = time - Math.min(...staged.map((item) => item.startTime));
  return staged.map((item) => ({ ...item, startTime: item.startTime + shift, endTime: item.endTime + shift }));
}

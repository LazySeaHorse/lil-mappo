import { useStore } from 'zustand';
import { useProjectStore } from './useProjectStore';
import { CAMERA_TRACK_ID } from './projectDocument';
import { partializeHistory, trackedStatesEqual } from './historyKeys';
import {
  HISTORY_LIMIT,
  clearHistoryMeta,
  historyMetaStore,
  recordHistoryEntry,
  runWithLabel,
  runWithSource,
  type HistoryMeta,
  type HistorySource,
} from './historyCore';

export type { HistoryMeta, HistorySource } from './historyCore';
export { HISTORY_LIMIT } from './historyCore';

/**
 * Undo/redo over the tracked project fields (see historyKeys.ts). zundo records
 * one step per store write; this module adds gesture coalescing, background
 * write suppression, label/source metadata and selection cleanup.
 */

const temporalStore = () => useProjectStore.temporal;

// --- pause bookkeeping ------------------------------------------------------
// One counter shared by gestures and withoutHistory so they nest safely.

let pauseDepth = 0;

function holdHistory(): void {
  if (pauseDepth++ === 0) temporalStore().getState().pause();
}

function releaseHistory(): void {
  if (pauseDepth === 0) return;
  if (--pauseDepth === 0) temporalStore().getState().resume();
}

/** Runs `fn` with history recording paused. Nesting-safe; sync functions only. */
export function withoutHistory<T>(fn: () => T): T {
  holdHistory();
  try {
    return fn();
  } finally {
    releaseHistory();
  }
}

/** Tags steps recorded inside `fn` with a source (e.g. 'ai'). Nesting-safe; sync only. */
export function withHistorySource<T>(source: HistorySource, fn: () => T): T {
  return runWithSource(source, fn);
}

/** Overrides the derived label of steps recorded inside `fn`. Nesting-safe; sync only. */
export function withHistoryLabel<T>(label: string, fn: () => T): T {
  return runWithLabel(label, fn);
}

// --- gestures ---------------------------------------------------------------

let gestureSnapshot: ReturnType<typeof partializeHistory> | null = null;

export function isGestureActive(): boolean {
  return gestureSnapshot !== null;
}

/** Starts coalescing every change until endGesture into one undo step. No-op if already active. */
export function beginGesture(): void {
  if (gestureSnapshot) return;
  gestureSnapshot = partializeHistory(useProjectStore.getState());
  holdHistory();
}

/** Ends the gesture; pushes one step if the tracked state changed. No-op without beginGesture. */
export function endGesture(): void {
  const before = gestureSnapshot;
  if (!before) return;
  gestureSnapshot = null;
  releaseHistory();

  const after = partializeHistory(useProjectStore.getState());
  if (trackedStatesEqual(before, after)) return;

  const temporal = temporalStore();
  const { pastStates } = temporal.getState();
  temporal.setState({
    pastStates: [...pastStates, before].slice(-HISTORY_LIMIT),
    futureStates: [],
  });
  recordHistoryEntry(before, after);
}

/**
 * Installs document-level pointer listeners that turn each press-drag-release
 * (slider, timeline drag, color picker) into one gesture. Discrete clicks
 * change state after pointerup (on click/pointerup targets), so they stay
 * ordinary steps. Returns the cleanup function.
 */
export function installGestureTracking(doc: Document = document, win: Window = window): () => void {
  const begin = () => beginGesture();
  const end = () => endGesture();
  doc.addEventListener('pointerdown', begin, true);
  doc.addEventListener('pointerup', end, true);
  doc.addEventListener('pointercancel', end, true);
  win.addEventListener('blur', end);
  return () => {
    doc.removeEventListener('pointerdown', begin, true);
    doc.removeEventListener('pointerup', end, true);
    doc.removeEventListener('pointercancel', end, true);
    win.removeEventListener('blur', end);
    endGesture();
  };
}

// --- undo / redo ------------------------------------------------------------

function isBlocked(): boolean {
  return useProjectStore.getState().isExporting || isGestureActive();
}

/** Clears selection/picker state that points at items or keyframes that no longer exist. */
function cleanupSelection(): void {
  const s = useProjectStore.getState();
  const camera = s.items[CAMERA_TRACK_ID];
  const keyframeExists =
    !!s.selectedKeyframeId &&
    camera?.kind === 'camera' &&
    camera.keyframes.some((k) => k.id === s.selectedKeyframeId);
  const patch: Partial<typeof s> = {};
  if (s.selectedItemId && !s.items[s.selectedItemId]) patch.selectedItemId = null;
  if (s.selectedKeyframeId && !keyframeExists) patch.selectedKeyframeId = null;
  if (s.selectedAutoCamRouteId && s.items[s.selectedAutoCamRouteId]?.kind !== 'route') {
    patch.selectedAutoCamRouteId = null;
  }
  if (s.activePicker?.ownerId && !s.items[s.activePicker.ownerId]) patch.activePicker = null;
  if (s.playheadTime > s.duration) patch.playheadTime = s.duration;

  // resolveStatus is written by background search (untracked), so a restored
  // snapshot can carry a stale 'idle'/'loading' next to valid geometry, which
  // the renderer would hide. Geometry present means resolved.
  let items = s.items;
  for (const [id, item] of Object.entries(s.items)) {
    if (item.kind === 'boundary' && item.geojson && item.resolveStatus !== 'resolved') {
      items = { ...items, [id]: { ...item, resolveStatus: 'resolved' } };
    }
  }
  if (items !== s.items) patch.items = items;
  if (Object.keys(patch).length) withoutHistory(() => useProjectStore.setState(patch));
}

export function canUndo(): boolean {
  return temporalStore().getState().pastStates.length > 0;
}

export function canRedo(): boolean {
  return temporalStore().getState().futureStates.length > 0;
}

/** Undoes one step. Returns false if blocked (exporting, mid-gesture) or nothing to undo. */
export function undo(): boolean {
  if (isBlocked() || !canUndo()) return false;
  temporalStore().getState().undo();
  cleanupSelection();
  return true;
}

/** Redoes one step. Returns false if blocked (exporting, mid-gesture) or nothing to redo. */
export function redo(): boolean {
  if (isBlocked() || !canRedo()) return false;
  temporalStore().getState().redo();
  cleanupSelection();
  return true;
}

/** Drops all history and any in-flight gesture/pause (project load, new project, tests). */
export function clearHistory(): void {
  gestureSnapshot = null;
  if (pauseDepth > 0) {
    pauseDepth = 0;
    temporalStore().getState().resume();
  }
  temporalStore().getState().clear();
  clearHistoryMeta();
}

// --- reading ----------------------------------------------------------------

export interface HistoryEntries {
  /** Oldest first; the last entry is what undo() reverts. */
  past: readonly HistoryMeta[];
  /** Last entry is what redo() re-applies. */
  future: readonly HistoryMeta[];
}

export function getHistoryEntries(): HistoryEntries {
  return historyMetaStore.getState();
}

/** Reactive entries with label/source metadata (e.g. an AI activity panel filtering source==='ai'). */
export function useHistoryEntries(): HistoryEntries {
  return useStore(historyMetaStore);
}

/** Narrow subscription for toolbar buttons; unaffected by playback ticks. */
export function useHistoryControls() {
  const canUndoNow = useStore(temporalStore(), (s) => s.pastStates.length > 0);
  const canRedoNow = useStore(temporalStore(), (s) => s.futureStates.length > 0);
  const undoLabel = useStore(historyMetaStore, (s) => s.past[s.past.length - 1]?.label ?? null);
  const redoLabel = useStore(historyMetaStore, (s) => s.future[s.future.length - 1]?.label ?? null);
  return { canUndo: canUndoNow, canRedo: canRedoNow, undoLabel, redoLabel };
}

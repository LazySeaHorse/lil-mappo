import { createStore } from 'zustand/vanilla';
import { describeChange } from './historyLabels';
import type { TrackedState } from './historyKeys';

/**
 * Pure history bookkeeping with no dependency on the project store, so the
 * store can register `recordHistoryEntry` as zundo's onSave without a cycle.
 */

export const HISTORY_LIMIT = 100;

export type HistorySource = 'user' | 'ai';

export interface HistoryMeta {
  label: string;
  source: HistorySource;
  /** Epoch ms when the step was recorded. */
  at: number;
}

/**
 * Metadata stacks kept index-aligned with zundo's pastStates/futureStates:
 * `past[i]` describes the change from pastStates[i] to the next state (or the
 * current state for the last entry); `future[i]` likewise for futureStates.
 */
export interface HistoryMetaState {
  past: HistoryMeta[];
  future: HistoryMeta[];
}

export const historyMetaStore = createStore<HistoryMetaState>(() => ({ past: [], future: [] }));

const sourceStack: HistorySource[] = [];
const labelStack: string[] = [];

export function currentHistorySource(): HistorySource {
  return sourceStack[sourceStack.length - 1] ?? 'user';
}

export function runWithSource<T>(source: HistorySource, fn: () => T): T {
  sourceStack.push(source);
  try {
    return fn();
  } finally {
    sourceStack.pop();
  }
}

export function runWithLabel<T>(label: string, fn: () => T): T {
  labelStack.push(label);
  try {
    return fn();
  } finally {
    labelStack.pop();
  }
}

/** Called for every step pushed onto the past stack; clears the redo side. */
export function recordHistoryEntry(before: Partial<TrackedState>, after: Partial<TrackedState>): void {
  const meta: HistoryMeta = {
    label: labelStack[labelStack.length - 1] ?? describeChange(before, after),
    source: currentHistorySource(),
    at: Date.now(),
  };
  const past = [...historyMetaStore.getState().past, meta];
  historyMetaStore.setState({ past: past.slice(-HISTORY_LIMIT), future: [] });
}

export function moveMetaOnUndo(): void {
  const { past, future } = historyMetaStore.getState();
  if (!past.length) return;
  historyMetaStore.setState({ past: past.slice(0, -1), future: [...future, past[past.length - 1]] });
}

export function moveMetaOnRedo(): void {
  const { past, future } = historyMetaStore.getState();
  if (!future.length) return;
  historyMetaStore.setState({ past: [...past, future[future.length - 1]], future: future.slice(0, -1) });
}

export function clearHistoryMeta(): void {
  historyMetaStore.setState({ past: [], future: [] });
}

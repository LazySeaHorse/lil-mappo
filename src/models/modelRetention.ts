import { useProjectStore } from '@/store/useProjectStore';
import type { ModelAsset } from '@/store/types';
import { retainModels } from './modelRegistry';

type WithModels = { models?: Record<string, ModelAsset> };

/** Files held outside the project, by hash, with how many holds each has. */
const held = new Map<string, number>();
/** The installed sweep, if any, so a release can free what nothing uses any more. */
let sweepNow: (() => void) | null = null;

/**
 * Keeps a model file in memory although the project does not use it yet, such as a model chosen in
 * the 3D model popup and not added. Returns the release; after it the file is freed unless the
 * project (or its undo history) took it in meanwhile.
 */
export function holdModelFile(sha256: string): () => void {
  held.set(sha256, (held.get(sha256) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (held.get(sha256) ?? 1) - 1;
    if (left > 0) held.set(sha256, left);
    else held.delete(sha256);
    if (sweepNow) queueMicrotask(sweepNow);
  };
}

/** Model files the project, any undo/redo step of it, or a hold still uses. */
export function modelHashesInUse(): Set<string> {
  const hashes = new Set<string>(held.keys());
  const add = (state: WithModels | undefined) => {
    for (const asset of Object.values(state?.models ?? {})) hashes.add(asset.sha256);
  };
  add(useProjectStore.getState());
  const { pastStates, futureStates } = useProjectStore.temporal.getState();
  pastStates.forEach(add);
  futureStates.forEach(add);
  return hashes;
}

/**
 * Frees a model file's memory once neither the project nor its history can reach it (deleted and
 * pushed out of undo, or another project opened). Returns the cleanup function.
 */
export function installModelRetention(): () => void {
  let stopped = false;
  const sweep = () => {
    if (!stopped) retainModels(modelHashesInUse());
  };
  // A store write reaches its listeners before the undo history records the state it replaced,
  // so a sweep straight away would free what undo can still bring back: wait for the history.
  const unsubscribeProject = useProjectStore.subscribe((state, previous) => {
    if (state.models !== previous.models) queueMicrotask(sweep);
  });
  const unsubscribeHistory = useProjectStore.temporal.subscribe(sweep);
  sweepNow = sweep;
  return () => {
    stopped = true;
    if (sweepNow === sweep) sweepNow = null;
    unsubscribeProject();
    unsubscribeHistory();
  };
}

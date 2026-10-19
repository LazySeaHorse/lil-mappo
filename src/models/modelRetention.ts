import { useProjectStore } from '@/store/useProjectStore';
import type { ModelAsset } from '@/store/types';
import { retainModels } from './modelRegistry';

type WithModels = { models?: Record<string, ModelAsset> };

/** Model files the project, or any undo/redo step of it, still uses. */
export function modelHashesInUse(): Set<string> {
  const hashes = new Set<string>();
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
  return () => {
    stopped = true;
    unsubscribeProject();
    unsubscribeHistory();
  };
}

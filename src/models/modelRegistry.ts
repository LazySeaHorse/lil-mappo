import { create } from 'zustand';
import type { ModelAsset } from '@/store/types';

/**
 * Imported model files, in memory only, by SHA-256. They are never uploaded and never written to
 * localStorage or IndexedDB: the project keeps only metadata (`Project.models`), so after a reload
 * a model is missing until the user picks its file again. Mapbox loads a model from its object URL.
 */
export interface LoadedModel {
  sha256: string;
  /** Object URL of the file's bytes. Revoked when the model is released. */
  url: string;
  byteSize: number;
  /** Mapbox could not load the file (reported by `ModelCatalog`); nothing that uses it is drawn. */
  failed: boolean;
}

/** Whether a model's file is in memory and drawn, missing (needs a relink) or failed to load. */
export type ModelStatus = 'ready' | 'missing' | 'failed';

interface ModelRegistryState {
  loaded: Record<string, LoadedModel>;
}

export const useModelRegistry = create<ModelRegistryState>(() => ({ loaded: {} }));

/** Keeps a model file's bytes for this session. The same bytes are kept once. */
export function registerModelBytes(sha256: string, bytes: ArrayBuffer): LoadedModel {
  const existing = useModelRegistry.getState().loaded[sha256];
  if (existing) return existing;
  const model: LoadedModel = {
    sha256,
    url: URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' })),
    byteSize: bytes.byteLength,
    failed: false,
  };
  useModelRegistry.setState((s) => ({ loaded: { ...s.loaded, [sha256]: model } }));
  return model;
}

export function getLoadedModel(sha256: string | undefined): LoadedModel | undefined {
  return sha256 ? useModelRegistry.getState().loaded[sha256] : undefined;
}

/** Marks a model file Mapbox could not load. It stays failed until the file is released. */
export function markModelFailed(sha256: string): void {
  const model = useModelRegistry.getState().loaded[sha256];
  if (!model || model.failed) return;
  useModelRegistry.setState((s) => ({ loaded: { ...s.loaded, [sha256]: { ...model, failed: true } } }));
}

const statusOf = (model: LoadedModel | undefined): ModelStatus => (!model ? 'missing' : model.failed ? 'failed' : 'ready');

export function modelStatus(asset: ModelAsset | undefined): ModelStatus {
  return statusOf(getLoadedModel(asset?.sha256));
}

/** Re-renders when the model's file arrives, goes or fails to load. */
export function useModelStatus(asset: ModelAsset | undefined): ModelStatus {
  return useModelRegistry((s) => statusOf(asset ? s.loaded[asset.sha256] : undefined));
}

/** True when the model's file is in memory; false means it is missing and needs a relink. */
export function isModelReady(asset: ModelAsset | undefined): boolean {
  return !!getLoadedModel(asset?.sha256);
}

/** Frees every model file not in `keep` and revokes its URL. */
export function retainModels(keep: ReadonlySet<string>): void {
  const { loaded } = useModelRegistry.getState();
  const released = Object.keys(loaded).filter((sha) => !keep.has(sha));
  if (released.length === 0) return;
  for (const sha of released) URL.revokeObjectURL(loaded[sha].url);
  useModelRegistry.setState({
    loaded: Object.fromEntries(Object.entries(loaded).filter(([sha]) => keep.has(sha))),
  });
}

/** Frees every model file (tests, sign-out). */
export function clearModelRegistry(): void {
  retainModels(new Set());
}

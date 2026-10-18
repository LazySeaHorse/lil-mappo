import { nanoid } from 'nanoid';
import { useProjectStore } from '@/store/useProjectStore';
import { createModelItem } from '@/store/itemFactories';
import type { ModelAsset, ModelItem } from '@/store/types';
import { readModelFile, type ReadModel } from './glb';
import { registerModelBytes } from './modelRegistry';

/** The name a model goes by on the timeline: its file name without `.glb`. */
export function modelNameFromFile(fileName: string): string {
  return fileName.replace(/\.glb$/i, '').trim() || '3D model';
}

/**
 * Reads a picked .glb, keeps its bytes in memory and returns its metadata. The project already
 * holding the same file keeps its asset (and id). Throws ModelFileError for a file it cannot use.
 */
export async function readModelAsset(file: File): Promise<ModelAsset> {
  const read = await readModelFile(file);
  registerModelBytes(read.sha256, read.bytes);
  const existing = Object.values(useProjectStore.getState().models).find((a) => a.sha256 === read.sha256);
  return existing ?? {
    id: nanoid(),
    fileName: read.fileName,
    byteSize: read.byteSize,
    sha256: read.sha256,
    bounds: read.bounds,
  };
}

/** Imports a .glb and places it on the map as a new model item (one undo step). */
export async function importModel(
  file: File,
  place: { position: [number, number]; startTime: number },
): Promise<ModelItem> {
  const asset = await readModelAsset(file);
  const item = createModelItem({ assetId: asset.id, name: modelNameFromFile(file.name), ...place });
  useProjectStore.getState().addModel(asset, item);
  return item;
}

export type RelinkResult =
  | { status: 'linked' }
  /** The file is a different model from the one the project was made with; `acceptRelink` uses it anyway. */
  | { status: 'mismatch'; file: ReadModel };

/** Gives a missing model its file back. The same file just loads; a different one needs the user's OK. */
export async function relinkModel(asset: ModelAsset, file: File): Promise<RelinkResult> {
  const read = await readModelFile(file);
  if (read.sha256 !== asset.sha256) return { status: 'mismatch', file: read };
  registerModelBytes(read.sha256, read.bytes);
  return { status: 'linked' };
}

/** Uses a different file for a model (after the user accepted the mismatch warning). */
export function acceptRelink(assetId: string, read: ReadModel): void {
  registerModelBytes(read.sha256, read.bytes);
  useProjectStore.getState().relinkModel(assetId, {
    fileName: read.fileName,
    byteSize: read.byteSize,
    sha256: read.sha256,
    bounds: read.bounds,
  });
}

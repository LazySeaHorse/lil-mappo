import { nanoid } from 'nanoid';
import { useProjectStore } from '@/store/useProjectStore';
import { createModelItem } from '@/store/itemFactories';
import type { ModelAsset, ModelItem } from '@/store/types';
import { clampVehicleScale } from '@/config/vehicles';
import { readModelFile, type ReadModel } from './glb';
import { modelExtent, type ModelBounds } from './modelGeometry';
import { registerModelBytes } from './modelRegistry';

/** The name a model goes by on the timeline: its file name without `.glb`. */
export function modelNameFromFile(fileName: string): string {
  return fileName.replace(/\.glb$/i, '').trim() || '3D model';
}

/**
 * Assets handed out by `readModelAsset` that the project does not hold yet, by file hash. A caller
 * adds its asset a moment after the read, so a second read of the same bytes in that gap would
 * otherwise get a different id. Settled entries are dropped on the next read.
 */
const pendingAssets = new Map<string, ModelAsset>();

/**
 * Reads a picked or downloaded .glb (`sourceUrl` is the link it came from), keeps its bytes in memory and returns its metadata. The project already
 * holding the same file, or another import of it still on its way in, keeps its asset (and id).
 * Throws ModelFileError for a file it cannot use.
 */
export async function readModelAsset(file: File, sourceUrl?: string): Promise<ModelAsset> {
  const read = await readModelFile(file);
  registerModelBytes(read.sha256, read.bytes);
  // Nothing awaits from here to the return, so concurrent reads of one file settle on one asset.
  const inProject = Object.values(useProjectStore.getState().models);
  for (const [sha, asset] of pendingAssets) {
    if (inProject.some((a) => a.id === asset.id)) pendingAssets.delete(sha);
  }
  const existing = inProject.find((a) => a.sha256 === read.sha256) ?? pendingAssets.get(read.sha256);
  if (existing) return existing;
  const asset: ModelAsset = {
    id: nanoid(),
    fileName: read.fileName,
    byteSize: read.byteSize,
    sha256: read.sha256,
    ...(sourceUrl ? { sourceUrl } : {}),
    bounds: read.bounds,
  };
  pendingAssets.set(read.sha256, asset);
  return asset;
}

/** Height a model under it starts at when placed, so a small one is not a speck on the map. */
export const MIN_START_HEIGHT_M = 100;

/**
 * The size a newly placed model starts at: its own (1x), or for one under 100 m tall the multiplier
 * that makes it 100 m (a 2 m drone starts at 50x). 1x keeps meaning the size it was made at.
 */
export function startingModelScale(bounds: ModelBounds): number {
  const { heightM } = modelExtent(bounds);
  if (!(heightM > 0) || heightM >= MIN_START_HEIGHT_M) return 1;
  return clampVehicleScale('custom', MIN_START_HEIGHT_M / heightM);
}

/**
 * Places a model the project already holds on the map as a new model item (one undo step), at
 * `scale`, or the starting size when left out.
 */
export function placeModel(
  asset: ModelAsset,
  { scale = startingModelScale(asset.bounds), ...place }: { position: [number, number]; startTime: number; scale?: number },
): ModelItem {
  const item = createModelItem({ assetId: asset.id, name: modelNameFromFile(asset.fileName), scale, ...place });
  useProjectStore.getState().addModel(asset, item);
  return item;
}

/** Imports a .glb and places it on the map as a new model item (one undo step). */
export async function importModel(
  file: File,
  place: { position: [number, number]; startTime: number },
): Promise<ModelItem> {
  return placeModel(await readModelAsset(file), place);
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

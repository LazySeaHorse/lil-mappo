import type { Map as MapboxMap } from 'mapbox-gl';
import type { ModelAsset, TimelineItem } from '@/store/types';
import { getLoadedModel } from '@/models/modelRegistry';
import { mutateMap } from './mapboxResources';

export interface ResolvedModel {
  /** Id of the model in the Mapbox style. */
  modelId: string;
  asset: ModelAsset;
}

/** Finds an imported model's Mapbox model, or null when it is missing (its file is not in memory). */
export interface ModelResolver {
  resolve(assetId: string): ResolvedModel | null;
}

/** Mapbox model id for an imported file; the hash makes a relinked, different file a new model. */
export function mapboxModelId(sha256: string): string {
  return `user-model-${sha256.slice(0, 16)}`;
}

/**
 * The imported models in the Mapbox style. A model is added from its in-memory object URL the
 * first time a layer needs it, and removed once nothing in the project uses it. A model whose file
 * is missing resolves to null, so nothing (or the fallback marker) is drawn, never an error.
 */
export class ModelCatalog implements ModelResolver {
  private readonly added = new Set<string>();

  constructor(
    private readonly map: MapboxMap,
    private readonly getModels: () => Record<string, ModelAsset>,
  ) {}

  resolve(assetId: string): ResolvedModel | null {
    const asset = this.getModels()[assetId];
    const loaded = getLoadedModel(asset?.sha256);
    if (!asset || !loaded) return null;
    const modelId = mapboxModelId(asset.sha256);
    if (!this.map.hasModel(modelId)) {
      const ok = mutateMap(this.map, { operation: 'addModel', phase: 'setup', resourceId: modelId }, () => {
        this.map.addModel(modelId, loaded.url);
      });
      if (!ok) return null;
    }
    this.added.add(modelId);
    return { modelId, asset };
  }

  /**
   * Removes the models no item or marker uses any more. Call after the layers are in line with
   * `items`, so no layer still points at a model being removed.
   */
  prune(items: Record<string, TimelineItem>): void {
    const models = this.getModels();
    const inUse = new Set<string>();
    for (const item of Object.values(items)) {
      const assetId = item.kind === 'model'
        ? item.assetId
        : item.kind === 'route' && item.calculation?.vehicle?.enabled && item.calculation.vehicle.type === 'custom'
          ? item.calculation.vehicle.modelId
          : null;
      const asset = assetId ? models[assetId] : undefined;
      if (asset && getLoadedModel(asset.sha256)) inUse.add(mapboxModelId(asset.sha256));
    }
    for (const modelId of [...this.added]) {
      if (inUse.has(modelId)) continue;
      this.added.delete(modelId);
      if (!this.map.hasModel(modelId)) continue;
      mutateMap(this.map, { operation: 'removeModel', phase: 'cleanup', resourceId: modelId }, () => {
        this.map.removeModel(modelId);
      });
    }
  }

  /** The style was replaced and took its models with it. */
  reset(): void {
    this.added.clear();
  }
}

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

/** A model this catalog added to the style, and where its load stands. */
interface CatalogEntry {
  state: 'loading' | 'ready';
  /** Nothing uses it any more: it is removed as soon as its load lands. */
  unused: boolean;
}

/**
 * The imported models in the Mapbox style. A model is added from its in-memory object URL the
 * first time a layer needs it, and removed once nothing in the project uses it. A model whose file
 * is missing resolves to null, so nothing (or the fallback marker) is drawn, never an error.
 *
 * Mapbox loads a model asynchronously: `hasModel` is false until the load lands, and `removeModel`
 * refuses a model that has not landed, which then lands in the style anyway. So the catalog keeps
 * its own record of what it added (it never adds a model twice) and removes a model dropped while
 * loading once its load lands (`styledata`). Call `attach` once the map exists and `detach` on dispose.
 */
export class ModelCatalog implements ModelResolver {
  private readonly entries = new Map<string, CatalogEntry>();

  constructor(
    private readonly map: MapboxMap,
    private readonly getModels: () => Record<string, ModelAsset>,
  ) {}

  attach(): void {
    this.map.on('styledata', this.handleStyleData);
  }

  detach(): void {
    this.map.off('styledata', this.handleStyleData);
  }

  resolve(assetId: string): ResolvedModel | null {
    const asset = this.getModels()[assetId];
    const loaded = getLoadedModel(asset?.sha256);
    if (!asset || !loaded) return null;
    const modelId = mapboxModelId(asset.sha256);
    const entry = this.entries.get(modelId);
    if (entry) {
      entry.unused = false;
    } else {
      const ok = mutateMap(this.map, { operation: 'addModel', phase: 'setup', resourceId: modelId }, () => {
        this.map.addModel(modelId, loaded.url);
      });
      if (!ok) return null;
      this.entries.set(modelId, { state: this.map.hasModel(modelId) ? 'ready' : 'loading', unused: false });
    }
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
    for (const [modelId, entry] of [...this.entries]) {
      if (!inUse.has(modelId)) this.release(modelId, entry);
    }
  }

  /** The style was replaced and took its models with it. */
  reset(): void {
    this.entries.clear();
  }

  private release(modelId: string, entry: CatalogEntry): void {
    if (entry.state === 'loading' && this.map.hasModel(modelId)) entry.state = 'ready';
    if (entry.state === 'loading') {
      entry.unused = true;
      return;
    }
    this.entries.delete(modelId);
    mutateMap(this.map, { operation: 'removeModel', phase: 'cleanup', resourceId: modelId }, () => {
      this.map.removeModel(modelId);
    });
  }

  /** Mapbox fires `styledata` when model loads land: mark them ready and remove the unused ones. */
  private readonly handleStyleData = (): void => {
    for (const [modelId, entry] of [...this.entries]) {
      if (entry.state !== 'loading' || !this.map.hasModel(modelId)) continue;
      entry.state = 'ready';
      if (entry.unused) this.release(modelId, entry);
    }
  };
}

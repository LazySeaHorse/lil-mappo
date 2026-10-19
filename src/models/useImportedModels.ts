import { useEffect } from 'react';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import type { ModelAsset, TimelineItem } from '@/store/types';
import { drawnModelId } from '@/store/modelAssets';
import { isModelReady, useModelRegistry } from './modelRegistry';
import { installModelRetention } from './modelRetention';
import { MODEL_TERMS } from './modelTerms';

/** The first item that uses each imported model whose file is not in memory. */
export function itemsWithMissingModels(
  items: Record<string, TimelineItem>,
  itemOrder: readonly string[],
  models: Record<string, ModelAsset>,
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of itemOrder) {
    const assetId = drawnModelId(items[id]);
    const asset = assetId ? models[assetId] : undefined;
    if (!asset || seen.has(asset.id) || isModelReady(asset)) continue;
    seen.add(asset.id);
    ids.push(id);
  }
  return ids;
}

/**
 * Editor-wide care of imported models: frees files nothing can reach any more, says so (with a Show
 * button) when a project opens with models whose files are not in memory (they are never saved),
 * and when the map could not load a model's file.
 */
export function useImportedModels(): void {
  useEffect(() => installModelRetention(), []);

  useEffect(() => useProjectStore.subscribe((state, previous) => {
    if (state.id === previous.id) return;
    const missing = itemsWithMissingModels(state.items, state.itemOrder, state.models);
    if (missing.length === 0) return;
    toast.warning(MODEL_TERMS.missingOnLoad(missing.length), {
      action: { label: MODEL_TERMS.show, onClick: () => useProjectStore.getState().selectItem(missing[0]) },
    });
  }), []);

  useEffect(() => useModelRegistry.subscribe((registry, previous) => {
    const { models, items, itemOrder } = useProjectStore.getState();
    for (const [sha256, model] of Object.entries(registry.loaded)) {
      if (!model.failed || previous.loaded[sha256]?.failed) continue;
      const assets = Object.values(models).filter((asset) => asset.sha256 === sha256);
      if (assets.length === 0) continue;
      const ids = new Set(assets.map((asset) => asset.id));
      const first = itemOrder.find((id) => {
        const assetId = drawnModelId(items[id]);
        return assetId !== null && ids.has(assetId);
      });
      toast.error(MODEL_TERMS.loadFailed(assets[0].fileName), {
        ...(first ? { action: { label: MODEL_TERMS.show, onClick: () => useProjectStore.getState().selectItem(first) } } : {}),
      });
    }
  }), []);
}

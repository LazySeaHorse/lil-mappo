import { useEffect } from 'react';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import type { ModelAsset, TimelineItem } from '@/store/types';
import { drawnModelId } from '@/store/modelAssets';
import { isModelReady, useModelRegistry } from './modelRegistry';
import { relinkModelFromUrl } from './modelUrl';
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
 * Editor-wide care of imported models: frees files nothing can reach any more, fetches again the
 * models that came from a link when a project opens, says so (with a Show button) when some still
 * have no file in memory (files are never saved),
 * and when the map could not load a model's file.
 */
export function useImportedModels(): void {
  useEffect(() => installModelRetention(), []);

  useEffect(() => {
    let stopped = false;
    const unsubscribe = useProjectStore.subscribe((state, previous) => {
      if (state.id === previous.id) return;
      const warn = () => {
        const current = useProjectStore.getState();
        // Another project may have opened while the links were loading.
        if (stopped || current.id !== state.id) return;
        const missing = itemsWithMissingModels(current.items, current.itemOrder, current.models);
        if (missing.length === 0) return;
        toast.warning(MODEL_TERMS.missingOnLoad(missing.length), {
          action: { label: MODEL_TERMS.show, onClick: () => useProjectStore.getState().selectItem(missing[0]) },
        });
      };
      // Models loaded from a link fetch their file again (checked against its hash); the rest need a relink.
      const fromLinks = Object.values(state.models).filter((asset) => asset.sourceUrl && !isModelReady(asset));
      if (fromLinks.length === 0) warn();
      else void Promise.allSettled(fromLinks.map((asset) => relinkModelFromUrl(asset))).then(warn);
    });
    return () => {
      stopped = true;
      unsubscribe();
    };
  }, []);

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

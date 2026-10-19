import { useEffect } from 'react';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import type { ModelAsset, TimelineItem } from '@/store/types';
import { isModelReady } from './modelRegistry';
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
    const item = items[id];
    const assetId = item?.kind === 'model'
      ? item.assetId
      : item?.kind === 'route' && item.calculation?.vehicle?.enabled && item.calculation.vehicle.type === 'custom'
        ? item.calculation.vehicle.modelId
        : null;
    const asset = assetId ? models[assetId] : undefined;
    if (!asset || seen.has(asset.id) || isModelReady(asset)) continue;
    seen.add(asset.id);
    ids.push(id);
  }
  return ids;
}

/**
 * Editor-wide care of imported models: frees files nothing can reach any more, and when a project
 * opens with models whose files are not in memory (they are never saved), says so with a Show button.
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
}

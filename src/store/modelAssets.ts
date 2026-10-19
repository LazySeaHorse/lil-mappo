import type { ModelAsset, TimelineItem } from './types';

/** The imported model an item draws on the map: a placed model's, or an enabled custom route marker's. */
export function drawnModelId(item: TimelineItem | undefined): string | null {
  if (item?.kind === 'model') return item.assetId;
  const vehicle = item?.kind === 'route' ? item.calculation?.vehicle : undefined;
  return vehicle?.enabled && vehicle.type === 'custom' ? vehicle.modelId : null;
}

/** Ids of the imported models that placed models and route markers use. */
export function referencedModelIds(items: Record<string, TimelineItem>): Set<string> {
  const ids = new Set<string>();
  for (const item of Object.values(items)) {
    if (item.kind === 'model') ids.add(item.assetId);
    else if (item.kind === 'route' && item.calculation?.vehicle?.type === 'custom') ids.add(item.calculation.vehicle.modelId);
  }
  return ids;
}

/** `models` without the ones nothing uses; the same object when nothing is dropped. */
export function pruneModels(
  items: Record<string, TimelineItem>,
  models: Record<string, ModelAsset>,
): Record<string, ModelAsset> {
  const ids = Object.keys(models);
  if (ids.length === 0) return models;
  const used = referencedModelIds(items);
  if (ids.every((id) => used.has(id))) return models;
  return Object.fromEntries(Object.entries(models).filter(([id]) => used.has(id)));
}

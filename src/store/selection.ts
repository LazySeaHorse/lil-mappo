import type { TransientProjectState } from './slices/types';

/**
 * The selection fields of the store. `selectedItemIds` is the selection;
 * `selectedItemId` is the one item being edited, so it is set only while exactly one is selected.
 * Everything that changes the selection spreads this, so the two cannot disagree.
 */
export function selectionOf(ids: readonly string[]): Pick<TransientProjectState, 'selectedItemIds' | 'selectedItemId'> {
  return {
    selectedItemIds: [...ids],
    selectedItemId: ids.length === 1 ? ids[0] : null,
  };
}

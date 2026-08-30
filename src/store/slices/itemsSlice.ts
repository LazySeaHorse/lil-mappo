import type { StateCreator } from 'zustand';
import { nanoid } from 'nanoid';
import type { TimelineItem } from '../types';
import type { ItemsSlice, ProjectStore } from './types';

export const createItemsSlice: StateCreator<ProjectStore, [], [], ItemsSlice> = (set) => ({
  addItem: (item) =>
    set((s) => ({
      items: { ...s.items, [item.id]: item },
      itemOrder: item.kind === 'camera' ? s.itemOrder : [...s.itemOrder, item.id],
    })),

  removeItem: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.items;
      return {
        items: rest,
        itemOrder: s.itemOrder.filter((i) => i !== id),
        selectedItemId: s.selectedItemId === id ? null : s.selectedItemId,
      };
    }),

  updateItem: (id, updates) =>
    set((s) => {
      const existing = s.items[id];
      if (!existing) return s;
      return {
        items: { ...s.items, [id]: { ...existing, ...updates } as TimelineItem },
      };
    }),

  reorderItems: (newOrder) => set({ itemOrder: newOrder }),

  duplicateItem: (id) =>
    set((s) => {
      const original = s.items[id];
      if (!original || original.kind === 'camera') return s;

      const newId = nanoid();
      const newItem = JSON.parse(JSON.stringify(original)) as TimelineItem;
      newItem.id = newId;

      if (newItem.kind === 'route') newItem.name = `${newItem.name} Copy`;
      if (newItem.kind === 'boundary') newItem.placeName = `${newItem.placeName} Copy`;
      if (newItem.kind === 'callout') newItem.title = `${newItem.title} Copy`;

      return {
        items: { ...s.items, [newId]: newItem },
        itemOrder: [...s.itemOrder, newId],
        selectedItemId: newId,
        isInspectorOpen: true,
      };
    }),
});

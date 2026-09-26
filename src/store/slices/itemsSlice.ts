import type { StateCreator } from 'zustand';
import { nanoid } from 'nanoid';
import type { TimelineItem } from '../types';
import type { ItemsSlice, ProjectStore } from './types';
import { isLegacyCallout, migrateCalloutV1ToV2 } from '@/annotations/migration';

export const createItemsSlice: StateCreator<ProjectStore, [], [], ItemsSlice> = (set) => ({
  addItem: (item) =>
    set((s) => {
      const cleanItem = isLegacyCallout(item) ? migrateCalloutV1ToV2(item) : item;
      return {
        items: { ...s.items, [cleanItem.id]: cleanItem },
        itemOrder: cleanItem.kind === 'camera' ? s.itemOrder : [...s.itemOrder, cleanItem.id],
      };
    }),

  removeItem: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.items;
      // Clean up camera keyframes followRoute if pointing to this deleted item
      const cam = rest['camera-track'];
      let updatedCam = cam;
      if (cam && cam.kind === 'camera' && Array.isArray(cam.keyframes)) {
        const hasFollow = cam.keyframes.some((k) => k.followRoute === id);
        if (hasFollow) {
          updatedCam = {
            ...cam,
            keyframes: cam.keyframes.map((k) => (k.followRoute === id ? { ...k, followRoute: null } : k)),
          };
        }
      }
      return {
        items: updatedCam && updatedCam !== cam ? { ...rest, ['camera-track']: updatedCam } : rest,
        itemOrder: s.itemOrder.filter((i) => i !== id),
        selectedItemId: s.selectedItemId === id ? null : s.selectedItemId,
        selectedAutoCamRouteId: s.selectedAutoCamRouteId === id ? null : s.selectedAutoCamRouteId,
        activePicker: s.activePicker?.id.includes(id) ? null : s.activePicker,
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
      if (newItem.kind === 'callout') newItem.content = { ...newItem.content, title: `${newItem.content.title} Copy` };

      return {
        items: { ...s.items, [newId]: newItem },
        itemOrder: [...s.itemOrder, newId],
        selectedItemId: newId,
        isInspectorOpen: true,
      };
    }),
});

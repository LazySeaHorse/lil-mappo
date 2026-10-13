import type { StateCreator } from 'zustand';
import { nanoid } from 'nanoid';
import type { TimelineItem } from '../types';
import type { ItemsSlice, ProjectStore } from './types';
import { CAMERA_TRACK_ID } from '../projectDocument';
import { applyWalkPatch } from '@/engine/routeCurves';
import { autoCamForRoute, defaultAutoCamFor } from '@/config/vehicles';
import { canEnableFollowCamera } from '../followCamera';
import { isRouteItem } from '../typeGuards';

export const createItemsSlice: StateCreator<ProjectStore, [], [], ItemsSlice> = (set, get) => ({
  addItem: (item) =>
    set((s) => ({
      items: { ...s.items, [item.id]: item },
      itemOrder: item.kind === 'camera' ? s.itemOrder : [...s.itemOrder, item.id],
    })),

  removeItem: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.items;
      // Clean up camera keyframes followRoute if pointing to this deleted item
      const cam = rest[CAMERA_TRACK_ID];
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
        items: updatedCam && updatedCam !== cam ? { ...rest, [CAMERA_TRACK_ID]: updatedCam } : rest,
        itemOrder: s.itemOrder.filter((i) => i !== id),
        selectedItemId: s.selectedItemId === id ? null : s.selectedItemId,
        selectedAutoCamRouteId: s.selectedAutoCamRouteId === id ? null : s.selectedAutoCamRouteId,
        activePicker: s.activePicker?.ownerId === id ? null : s.activePicker,
        routeDraft: s.routeDraft?.routeId === id ? null : s.routeDraft,
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

  updateWalkRoute: (id, update) =>
    set((s) => {
      const route = s.items[id];
      if (route?.kind !== 'route' || route.calculation?.mode !== 'walk') return s;
      const patch = typeof update === 'function' ? update(route.calculation) : update;
      return {
        items: { ...s.items, [id]: { ...route, ...applyWalkPatch(route.calculation, patch) } },
      };
    }),

  setFollowCamera: (routeId, on) => {
    const route = get().items[routeId];
    if (!isRouteItem(route)) return { ok: false, reason: 'not-found' };

    if (!on) {
      if (route.autoCam) {
        set((s) => ({ items: { ...s.items, [routeId]: { ...route, autoCam: { ...route.autoCam!, enabled: false } } } }));
      }
      return { ok: true };
    }

    const result = canEnableFollowCamera(get(), routeId);
    if (!result.ok) return result;
    // Turning it back on keeps the settings it had; the first time, it is fitted to the route.
    const autoCam = route.autoCam
      ? { ...defaultAutoCamFor(route.calculation?.vehicle?.type), ...route.autoCam, enabled: true }
      : autoCamForRoute(route);
    set((s) => ({ items: { ...s.items, [routeId]: { ...route, autoCam } } }));
    return { ok: true };
  },

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

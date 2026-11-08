import type { StateCreator } from 'zustand';
import { nanoid } from 'nanoid';
import type { TimelineItem } from '../types';
import type { ItemsSlice, ProjectStore } from './types';
import { CAMERA_TRACK_ID } from '../projectDocument';
import { applyWalkPatch } from '@/engine/routeCurves';
import { autoCamForRoute, defaultAutoCamFor } from '@/config/vehicles';
import { canEnableFollowCamera } from '../followCamera';
import { isRouteItem } from '../typeGuards';
import { pruneModels } from '../modelAssets';
import { selectionOf } from '../selection';
import { gatherInOrder, nextGroupColor, withoutMembers } from '../timelineGroups';
import { stagedAt, stagedItemsOf } from '@/engine/stagedItems';

export const createItemsSlice: StateCreator<ProjectStore, [], [], ItemsSlice> = (set, get) => ({
  addItem: (item) =>
    set((s) => ({
      items: { ...s.items, [item.id]: item },
      itemOrder: item.kind === 'camera' ? s.itemOrder : [...s.itemOrder, item.id],
    })),

  addStagedItems: (owner) => {
    const added = stagedAt(stagedItemsOf(get(), owner), get().playheadTime);
    if (added.length === 0) return added;
    set((s) => ({
      items: { ...s.items, ...Object.fromEntries(added.map((item) => [item.id, item])) },
      itemOrder: [...s.itemOrder, ...added.map((item) => item.id)],
      stagedItems: [],
      stagedBy: null,
    }));
    return added;
  },

  removeItem: (id) => get().removeItems([id]),

  removeItems: (ids) =>
    set((s) => {
      const gone = new Set(ids.filter((id) => id in s.items));
      if (gone.size === 0) return s;
      const rest = Object.fromEntries(Object.entries(s.items).filter(([id]) => !gone.has(id)));
      // Clean up camera keyframes followRoute if pointing to a deleted item
      const cam = rest[CAMERA_TRACK_ID];
      let updatedCam = cam;
      if (cam && cam.kind === 'camera' && Array.isArray(cam.keyframes)) {
        const hasFollow = cam.keyframes.some((k) => k.followRoute !== null && gone.has(k.followRoute));
        if (hasFollow) {
          updatedCam = {
            ...cam,
            keyframes: cam.keyframes.map((k) => (k.followRoute !== null && gone.has(k.followRoute) ? { ...k, followRoute: null } : k)),
          };
        }
      }
      const items = updatedCam && updatedCam !== cam ? { ...rest, [CAMERA_TRACK_ID]: updatedCam } : rest;
      return {
        items,
        // An imported model nothing uses any more goes with its last item (undo brings both back).
        models: pruneModels(items, s.models),
        itemOrder: s.itemOrder.filter((i) => !gone.has(i)),
        groups: withoutMembers(s.groups, gone),
        ...selectionOf(s.selectedItemIds.filter((i) => !gone.has(i))),
        selectedAutoCamRouteId: s.selectedAutoCamRouteId && gone.has(s.selectedAutoCamRouteId) ? null : s.selectedAutoCamRouteId,
        activePicker: s.activePicker && gone.has(s.activePicker.ownerId) ? null : s.activePicker,
        routeDraft: s.routeDraft && gone.has(s.routeDraft.routeId) ? null : s.routeDraft,
      };
    }),

  updateItem: (id, updates) =>
    set((s) => {
      const existing = s.items[id];
      if (!existing) return s;
      const items = { ...s.items, [id]: { ...existing, ...updates } as TimelineItem };
      return { items, models: pruneModels(items, s.models) };
    }),

  updateItems: (updates) =>
    set((s) => {
      const known = Object.entries(updates).filter(([id]) => id in s.items);
      if (known.length === 0) return s;
      const items = { ...s.items };
      for (const [id, patch] of known) items[id] = { ...items[id], ...patch } as TimelineItem;
      return { items, models: pruneModels(items, s.models) };
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

  groupItems: (ids) =>
    set((s) => {
      const members = new Set(ids.filter((id) => s.items[id] && s.items[id].kind !== 'camera'));
      if (members.size < 2) return s;
      const alreadyGrouped = Object.values(s.groups).some(
        (group) => group.itemIds.length === members.size && group.itemIds.every((id) => members.has(id)),
      );
      if (alreadyGrouped) return s;
      const groups = withoutMembers(s.groups, members);
      const id = nanoid();
      return {
        groups: {
          ...groups,
          [id]: { id, color: nextGroupColor(groups), itemIds: s.itemOrder.filter((itemId) => members.has(itemId)) },
        },
        itemOrder: gatherInOrder(s.itemOrder, members),
        collapsedGroupIds: s.collapsedGroupIds.filter((groupId) => groupId in groups),
      };
    }),

  ungroupItems: (ids) =>
    set((s) => {
      const groups = Object.fromEntries(
        Object.entries(s.groups).filter(([, group]) => !group.itemIds.some((id) => ids.includes(id))),
      );
      if (Object.keys(groups).length === Object.keys(s.groups).length) return s;
      return { groups, collapsedGroupIds: s.collapsedGroupIds.filter((groupId) => groupId in groups) };
    }),

  setGroupColor: (groupId, color) =>
    set((s) => (s.groups[groupId] ? { groups: { ...s.groups, [groupId]: { ...s.groups[groupId], color } } } : s)),

  toggleGroupCollapsed: (groupId) =>
    set((s) => {
      if (!s.groups[groupId]) return s;
      const collapsed = s.collapsedGroupIds.includes(groupId);
      return {
        collapsedGroupIds: collapsed
          ? s.collapsedGroupIds.filter((id) => id !== groupId)
          : [...s.collapsedGroupIds, groupId],
      };
    }),

  duplicateItem: (id) =>
    set((s) => {
      const original = s.items[id];
      if (!original || original.kind === 'camera') return s;

      const newId = nanoid();
      const newItem = JSON.parse(JSON.stringify(original)) as TimelineItem;
      newItem.id = newId;

      if (newItem.kind === 'route') newItem.name = `${newItem.name} Copy`;
      if (newItem.kind === 'boundary') newItem.placeName = `${newItem.placeName} Copy`;
      if (newItem.kind === 'model') newItem.name = `${newItem.name} Copy`;
      if (newItem.kind === 'callout') newItem.content = { ...newItem.content, title: `${newItem.content.title} Copy` };

      return {
        items: { ...s.items, [newId]: newItem },
        itemOrder: [...s.itemOrder, newId],
        ...selectionOf([newId]),
        isInspectorOpen: true,
      };
    }),

  addModel: (asset, item) =>
    set((s) => ({
      models: s.models[asset.id] ? s.models : { ...s.models, [asset.id]: asset },
      ...(item ? { items: { ...s.items, [item.id]: item }, itemOrder: [...s.itemOrder, item.id] } : {}),
    })),

  relinkModel: (assetId, file) =>
    set((s) => (s.models[assetId] ? { models: { ...s.models, [assetId]: { ...file, id: assetId } } } : s)),
});

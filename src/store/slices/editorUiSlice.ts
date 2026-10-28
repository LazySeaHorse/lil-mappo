import type { StateCreator } from 'zustand';
import type { EditorUiSlice, ProjectStore } from './types';
import { writeTimelineHeight } from '../timelineHeightPreference';
import { CAMERA_TRACK_ID } from '../projectDocument';
import { savedCalculation } from '@/engine/routeDraft';
import { prefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export const createEditorUiSlice: StateCreator<ProjectStore, [], [], EditorUiSlice> = (
  set,
  get,
) => ({
  selectItem: (id) => {
    const state = get();
    const item = id ? state.items[id] : null;
    let newPlayheadTime = state.playheadTime;
    if (item && 'startTime' in item && 'endTime' in item) {
      if (state.playheadTime < item.startTime || state.playheadTime > item.endTime) {
        newPlayheadTime = item.startTime;
      }
    }
    set({
      selectedItemId: id,
      selectedKeyframeId: null,
      selectedAutoCamRouteId: null,
      isInspectorOpen: true,
      // Selecting another item ends a dismissal; deselecting or reselecting the same one keeps it.
      ...(id && id !== state.previewDismissedId ? { previewDismissedId: null } : {}),
      ...(newPlayheadTime !== state.playheadTime ? { playheadTime: newPlayheadTime } : {}),
    });
  },
  dismissSelectionPreview: () => set((s) => ({ previewDismissedId: s.selectedItemId })),

  selectKeyframe: (id) => {
    const state = get();
    const camera = state.items[CAMERA_TRACK_ID];
    let newPlayheadTime = state.playheadTime;
    if (camera && camera.kind === 'camera' && id) {
      const kf = camera.keyframes.find((k) => k.id === id);
      if (kf) {
        newPlayheadTime = kf.time;
      }
    }
    set({
      selectedKeyframeId: id,
      isInspectorOpen: true,
      ...(newPlayheadTime !== state.playheadTime ? { playheadTime: newPlayheadTime } : {}),
    });
  },
  setSelectedAutoCamRouteId: (id) => set({ selectedAutoCamRouteId: id }),

  setHideUI: (v) => set({ hideUI: v }),
  setFitMode: (v) => set({ isFitMode: v }),
  setIsExporting: (v) => set({ isExporting: v }),
  setShowNewProjectModal: (v) => set({ showNewProjectModal: v }),
  setIsInspectorOpen: (v) => set({ isInspectorOpen: v }),
  setTimelineHeight: (v) => {
    writeTimelineHeight(v);
    set({ timelineHeight: v });
  },
  setMapCenter: (v) => set({ mapCenter: v }),

  startPicking: (session) => set({ activePicker: session }),
  stopPicking: () => set({ activePicker: null }),
  setPreviewRoute: (v) => set({ previewRoute: v }),
  setPreviewSpokes: (v) => set({ previewSpokes: v }),
  setPreviewSpokeFocus: (id) => set({ previewSpokeFocus: id }),
  setDraftWalk: (v) => set({ draftWalk: v }),

  startRouteDraft: (routeId) => {
    const route = get().items[routeId];
    if (route?.kind !== 'route') return;
    set({ routeDraft: { routeId, calculation: structuredClone(savedCalculation(route.calculation)) } });
  },
  updateRouteDraft: (update) =>
    set((s) => (s.routeDraft ? { routeDraft: { ...s.routeDraft, calculation: update(s.routeDraft.calculation) } } : s)),
  discardRouteDraft: () => set({ routeDraft: null }),

  setBoundaryDetail: (id) => set({ boundaryDetail: id }),

  playAppearPreview: (itemIds) => {
    const { selectedItemId, playheadTime } = get();
    // With less motion asked for, it starts finished.
    const startedAt = prefersReducedMotion() ? -Infinity : performance.now();
    set({ appearPreview: { itemIds, startedAt, selectedItemId, playheadTime } });
  },
  stageItems: (owner, items) => set({ stagedItems: items, stagedBy: items.length ? owner : null }),
  clearStagedItems: (owner) => set((s) => (s.stagedBy === owner ? { stagedItems: [], stagedBy: null } : s)),
});

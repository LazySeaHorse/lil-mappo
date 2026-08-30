import type { StateCreator } from 'zustand';
import type { EditorUiSlice, ProjectStore } from './types';

export const createEditorUiSlice: StateCreator<ProjectStore, [], [], EditorUiSlice> = (
  set,
  get,
) => ({
  selectItem: (id) =>
    set({
      selectedItemId: id,
      selectedKeyframeId: null,
      selectedAutoCamRouteId: null,
      isInspectorOpen: true,
    }),

  selectKeyframe: (id) => set({ selectedKeyframeId: id, isInspectorOpen: true }),
  setSelectedAutoCamRouteId: (id) => set({ selectedAutoCamRouteId: id }),

  setMoveModeActive: (v) => set({ isMoveModeActive: v }),
  setHideUI: (v) => set({ hideUI: v }),
  setIsExporting: (v) => set({ isExporting: v }),
  setShowNewProjectModal: (v) => set({ showNewProjectModal: v }),
  setProjectSettingsTab: (tab) => set({ projectSettingsTab: tab }),
  setIsInspectorOpen: (v) => set({ isInspectorOpen: v }),
  setTimelineHeight: (v) => set({ timelineHeight: v }),
  setMapCenter: (v) => set({ mapCenter: v }),

  setEditingRoutePoint: (p) => set({ editingRoutePoint: p }),
  setDraftStart: (v) => set({ draftStart: v }),
  setDraftEnd: (v) => set({ draftEnd: v }),
  setDraftCallout: (v) => set({ draftCallout: v }),
  setEditingItemId: (id) => set({ editingItemId: id }),
  setPreviewRoute: (v) => set({ previewRoute: v }),

  setPreviewBoundary: (geojson, name) =>
    set({
      previewBoundary: geojson,
      draftBoundaryName: name,
      previewBoundaryStyle: get().previewBoundaryStyle || {
        strokeColor: '#a855f7',
        fillColor: '#a855f7',
        strokeWidth: 5,
        glow: true,
        fillOpacity: 0.1,
        animateStroke: true,
        animationStyle: 'draw',
        traceLength: 0.1,
      },
    }),

  setPreviewBoundaryStyle: (updates) =>
    set((s) => ({
      previewBoundaryStyle: s.previewBoundaryStyle
        ? { ...s.previewBoundaryStyle, ...updates }
        : null,
    })),

  clearPreviewBoundary: () =>
    set({
      previewBoundary: null,
      previewBoundaryStyle: null,
      draftBoundaryName: '',
    }),
});

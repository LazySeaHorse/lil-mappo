import type { StateCreator } from 'zustand';
import type { EditorUiSlice, ProjectStore } from './types';
import { writeTimelineHeight } from '../timelineHeightPreference';
import { CAMERA_TRACK_ID } from '../projectDocument';
import { DEFAULT_BOUNDARY_STYLE } from '../itemFactories';
import { savedCalculation } from '@/engine/routeDraft';

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
      ...(newPlayheadTime !== state.playheadTime ? { playheadTime: newPlayheadTime } : {}),
    });
  },

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

  setMoveModeActive: (v) => set({ isMoveModeActive: v }),
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

  setPreviewBoundary: (geojson, name, countryCode = null) =>
    set({
      previewBoundary: geojson,
      draftBoundaryName: name,
      // The flag follows the searched place; the rest of the style is kept across searches
      previewBoundaryStyle: { ...(get().previewBoundaryStyle || DEFAULT_BOUNDARY_STYLE), flagCode: countryCode },
    }),

  setPreviewBoundaryStyle: (updates) =>
    set((s) => ({
      previewBoundaryStyle: s.previewBoundaryStyle
        ? { ...s.previewBoundaryStyle, ...updates }
        : null,
    })),

  setBoundaryDetail: (id) => set({ boundaryDetail: id }),

  clearPreviewBoundary: () =>
    set({
      previewBoundary: null,
      previewBoundaryStyle: null,
      draftBoundaryName: '',
    }),
});

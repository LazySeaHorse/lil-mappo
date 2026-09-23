import type { StateCreator } from 'zustand';
import type { EditorUiSlice, ProjectStore } from './types';
import { CAMERA_TRACK_ID } from '../projectDocument';

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
  setIsExporting: (v) => set({ isExporting: v }),
  setShowNewProjectModal: (v) => set({ showNewProjectModal: v }),
  setProjectSettingsTab: (tab) => set({ projectSettingsTab: tab }),
  setIsInspectorOpen: (v) => set({ isInspectorOpen: v }),
  setTimelineHeight: (v) => set({ timelineHeight: v }),
  setMapCenter: (v) => set({ mapCenter: v }),

  startPicking: (session) => set({ activePicker: session }),
  stopPicking: () => set({ activePicker: null }),
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

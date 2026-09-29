import type { StateCreator } from 'zustand';
import { STANDARD_CAPABILITIES } from '@/config/mapbox';
import type { MapEnvironmentSlice, ProjectStore, TransientProjectState } from './types';

/** Fresh transient editor state shared by initial creation and project loads. */
export function createTransientState(): TransientProjectState {
  return {
    playheadTime: 0,
    isPlaying: false,
    isScrubbing: false,
    isInspectorOpen: false,
    timelineHeight: 256,
    terrainLoading: false,
    buildingsLoading: false,
    isCameraEnabled: true,
    detectedCapabilities: STANDARD_CAPABILITIES,
    selectedItemId: null,
    selectedKeyframeId: null,
    selectedAutoCamRouteId: null,
    isMoveModeActive: false,
    hideUI: false,
    isExporting: false,
    showNewProjectModal: false,
    projectSettingsTab: 'general',
    activePicker: null,
    previewRoute: null,
    draftWalk: null,
    previewBoundary: null,
    previewBoundaryStyle: null,
    draftBoundaryName: '',
  };
}

export const createMapEnvironmentSlice: StateCreator<
  ProjectStore,
  [],
  [],
  MapEnvironmentSlice
> = (set) => ({
  setMapStyle: (s) =>
    set((s2) => ({
      mapStyle: s,
      // The DEM source/terrain are re-added by BasemapController after the swap.
      terrainLoading: s2.terrainEnabled,
      buildingsLoading: false,
      detectedCapabilities: null,
    })),

  setLabelGroupVisibility: (groupId, visible) =>
    set((s) => ({
      labelVisibility: { ...s.labelVisibility, [groupId]: visible },
    })),

  setAllLabelsVisibility: (visible) =>
    set((s) => {
      const newVisibility: Record<string, boolean> = {};
      if (s.detectedCapabilities) {
        s.detectedCapabilities.labelGroups.forEach((group) => {
          newVisibility[group.id] = visible;
        });
      }
      return { labelVisibility: newVisibility };
    }),

  set3dDetails: (key, visible) =>
    set(() => {
      if (key === 'landmarks') return { show3dLandmarks: visible };
      if (key === 'trees') return { show3dTrees: visible };
      return { show3dFacades: visible };
    }),

  setTerrainEnabled: (v) => set({ terrainEnabled: v, terrainLoading: v }),
  setBuildingsEnabled: (v) => set({ buildingsEnabled: v }),
  setTerrainLoading: (v) => set({ terrainLoading: v }),
  setBuildingsLoading: (v) => set({ buildingsLoading: v }),
  setDetectedCapabilities: (caps) => set({ detectedCapabilities: caps }),
});

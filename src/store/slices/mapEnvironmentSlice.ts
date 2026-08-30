import type { StateCreator } from 'zustand';
import type { MapStyleCapabilities } from '@/config/mapbox';
import type { MapEnvironmentSlice, ProjectStore, TransientProjectState } from './types';

// Eagerly initialize standard style capabilities
export const STANDARD_STYLE_CAPABILITIES: MapStyleCapabilities = {
  labelGroups: [
    { id: 'road', label: 'Road Labels', layerPatterns: ['road'] },
    { id: 'place', label: 'Place Names', layerPatterns: ['place'] },
    { id: 'poi', label: 'Points of Interest', layerPatterns: ['poi'] },
    { id: 'transit', label: 'Transit', layerPatterns: ['transit'] },
    { id: 'water', label: 'Water Names', layerPatterns: ['water'] },
    { id: 'natural', label: 'Natural Features', layerPatterns: ['natural'] },
    { id: 'building', label: 'Building Names', layerPatterns: ['building'] },
    { id: 'area', label: 'Area Labels', layerPatterns: ['area'] },
  ],
  landmarks3d: true,
  trees3d: true,
  facades3d: true,
  timeOfDayPreset: true,
  colorCustomization: false,
};

/** Fresh transient editor state shared by initial creation and project loads. */
export function createTransientState(): TransientProjectState {
  return {
    mapStyle: 'standard',
    labelVisibility: {},
    playheadTime: 0,
    isPlaying: false,
    isScrubbing: false,
    isInspectorOpen: false,
    timelineHeight: 256,
    terrainLoading: false,
    buildingsLoading: false,
    isCameraEnabled: true,
    detectedCapabilities: STANDARD_STYLE_CAPABILITIES,
    terrainEnabled: false,
    buildingsEnabled: false,
    show3dLandmarks: true,
    show3dTrees: true,
    show3dFacades: true,
    selectedItemId: null,
    selectedKeyframeId: null,
    selectedAutoCamRouteId: null,
    isMoveModeActive: false,
    hideUI: false,
    isExporting: false,
    showNewProjectModal: false,
    projectSettingsTab: 'general',
    editingRoutePoint: null,
    editingItemId: null,
    draftStart: null,
    draftEnd: null,
    draftCallout: null,
    previewRoute: null,
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
    set({
      mapStyle: s,
      terrainEnabled: false,
      buildingsEnabled: false,
      terrainLoading: false,
      buildingsLoading: false,
      detectedCapabilities: null,
    }),

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

  applyRenderConfig: (config) =>
    set({
      mapStyle: config.mapStyle,
      terrainEnabled: config.terrainEnabled,
      buildingsEnabled: config.buildingsEnabled,
      labelVisibility: config.labelVisibility,
      show3dLandmarks: config.show3dLandmarks,
      show3dTrees: config.show3dTrees,
      show3dFacades: config.show3dFacades,
    }),
});

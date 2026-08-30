import type { StateCreator } from 'zustand';
import { getExportDimensions } from '@/types/render';
import { parseProjectDocument } from '../projectDocument';
import type { ProjectSettingsSlice, ProjectStore } from './types';
import { createTransientState } from './mapEnvironmentSlice';

export const createProjectSettingsSlice: StateCreator<
  ProjectStore,
  [],
  [],
  ProjectSettingsSlice
> = (set) => ({
  setProjectName: (n) => set({ name: n }),
  setResolution: (r) => set({ resolution: r }),
  setAspectRatio: (v) =>
    set((s) => ({
      aspectRatio: v,
      resolution: getExportDimensions(s.exportResolution, v, s.isVertical),
    })),
  setExportResolution: (v) =>
    set((s) => ({
      exportResolution: v,
      resolution: getExportDimensions(v, s.aspectRatio, s.isVertical),
    })),
  setIsVertical: (v) =>
    set((s) => ({
      isVertical: v,
      resolution: getExportDimensions(s.exportResolution, s.aspectRatio, v),
    })),
  setProjection: (v) => set({ projection: v }),
  setLightPreset: (v) => set({ lightPreset: v }),
  setAtmosphere: (updates) => set((s) => ({ ...s, ...updates })),
  setTerrainExaggeration: (v) => set({ terrainExaggeration: v }),

  loadFullProject: (input) => {
    const project = parseProjectDocument(input);
    set({
      ...project,
      ...createTransientState(),
      // Loading opens the inspector and forces capability re-detection.
      isInspectorOpen: true,
      detectedCapabilities: null,
    });
  },
});

import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Project, TimelineItem, CameraKeyframe, RouteItem, BoundaryItem, CalloutItem, CameraItem, EasingName } from './types';

interface ProjectStore extends Project {
  // Item CRUD
  addItem: (item: TimelineItem) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, updates: Partial<TimelineItem>) => void;
  reorderItems: (newOrder: string[]) => void;

  // Selection
  selectItem: (id: string | null) => void;
  selectKeyframe: (id: string | null) => void;

  // Camera keyframes
  addCameraKeyframe: (kf: CameraKeyframe) => void;
  updateCameraKeyframe: (kfId: string, updates: Partial<CameraKeyframe>) => void;
  removeCameraKeyframe: (kfId: string) => void;

  // Playback
  setPlayheadTime: (t: number) => void;
  setIsPlaying: (playing: boolean) => void;

  // Project settings
  setDuration: (d: number) => void;
  setFps: (fps: 30 | 60) => void;
  setResolution: (r: [number, number]) => void;
  setMapStyle: (s: string) => void;
  setProjection: (v: 'globe' | 'mercator') => void;
  setLightPreset: (v: 'day' | 'night' | 'dusk' | 'dawn') => void;
  setMapLanguage: (v: string) => void;
  setAtmosphere: (updates: { starIntensity?: number; fogColor?: string | null }) => void;
  setLabelVisibility: (key: 'road' | 'place' | 'poi' | 'transit', visible: boolean) => void;
  set3dDetails: (key: 'landmarks' | 'trees' | 'facades', visible: boolean) => void;
  setTerrainEnabled: (v: boolean) => void;
  setBuildingsEnabled: (v: boolean) => void;
  setTerrainExaggeration: (v: number) => void;
  setProjectName: (n: string) => void;

  // Move Mode (Manual Positioning)
  isMoveModeActive: boolean;
  setMoveModeActive: (v: boolean) => void;

  // Loading indicators (transient UI state)
  terrainLoading: boolean;
  buildingsLoading: boolean;
  setTerrainLoading: (v: boolean) => void;
  setBuildingsLoading: (v: boolean) => void;

  // Zen Mode
  hideUI: boolean;
  setHideUI: (v: boolean) => void;

  // Inspector visibility
  isInspectorOpen: boolean;
  setIsInspectorOpen: (v: boolean) => void;

  // Project loading
  loadFullProject: (project: Project) => void;
}

const CAMERA_ID = 'camera-track';

const initialCamera: CameraItem = {
  kind: 'camera',
  id: CAMERA_ID,
  keyframes: [],
};

const defaultProject: Project = {
  id: nanoid(),
  name: 'Untitled Project',
  duration: 30,
  fps: 30,
  resolution: [1920, 1080],
  mapStyle: 'streets',
  projection: 'globe',
  lightPreset: 'day',
  showRoadLabels: true,
  showPlaceLabels: true,
  showPointOfInterestLabels: true,
  showTransitLabels: true,
  show3dLandmarks: true,
  show3dTrees: true,
  show3dFacades: true,
  mapLanguage: 'en',
  starIntensity: 0.6,
  fogColor: null,
  terrainEnabled: false,
  buildingsEnabled: false,
  terrainExaggeration: 1.5,
  items: { [CAMERA_ID]: initialCamera },
  itemOrder: [CAMERA_ID],
  playheadTime: 0,
  isPlaying: false,
  selectedItemId: null,
  selectedKeyframeId: null,
  isMoveModeActive: false,
  hideUI: false,
  isInspectorOpen: true,
};

export const useProjectStore = create<ProjectStore>((set, get) => ({
  ...defaultProject,
  terrainLoading: false,
  buildingsLoading: false,

  addItem: (item) => set((s) => ({
    items: { ...s.items, [item.id]: item },
    itemOrder: item.kind === 'camera' ? s.itemOrder : [...s.itemOrder, item.id],
  })),

  removeItem: (id) => set((s) => {
    const { [id]: _, ...rest } = s.items;
    return {
      items: rest,
      itemOrder: s.itemOrder.filter((i) => i !== id),
      selectedItemId: s.selectedItemId === id ? null : s.selectedItemId,
    };
  }),

  updateItem: (id, updates) => set((s) => {
    const existing = s.items[id];
    if (!existing) return s;
    return {
      items: { ...s.items, [id]: { ...existing, ...updates } as TimelineItem },
    };
  }),

  reorderItems: (newOrder) => set({ itemOrder: newOrder }),

  selectItem: (id) => set({ selectedItemId: id, selectedKeyframeId: null, isInspectorOpen: true }),
  selectKeyframe: (id) => set({ selectedKeyframeId: id, isInspectorOpen: true }),

  addCameraKeyframe: (kf) => set((s) => {
    const cam = s.items[CAMERA_ID] as CameraItem;
    const keyframes = [...cam.keyframes, kf].sort((a, b) => a.time - b.time);
    return {
      items: { ...s.items, [CAMERA_ID]: { ...cam, keyframes } },
      selectedItemId: CAMERA_ID,
      selectedKeyframeId: kf.id,
      isInspectorOpen: true,
    };
  }),

  updateCameraKeyframe: (kfId, updates) => set((s) => {
    const cam = s.items[CAMERA_ID] as CameraItem;
    const keyframes = cam.keyframes.map((kf) =>
      kf.id === kfId ? { ...kf, ...updates } : kf
    ).sort((a, b) => a.time - b.time);
    return {
      items: { ...s.items, [CAMERA_ID]: { ...cam, keyframes } },
    };
  }),

  removeCameraKeyframe: (kfId) => set((s) => {
    const cam = s.items[CAMERA_ID] as CameraItem;
    return {
      items: {
        ...s.items,
        [CAMERA_ID]: { ...cam, keyframes: cam.keyframes.filter((k) => k.id !== kfId) },
      },
      selectedKeyframeId: s.selectedKeyframeId === kfId ? null : s.selectedKeyframeId,
    };
  }),

  setPlayheadTime: (t) => set({ playheadTime: Math.max(0, Math.min(t, get().duration)) }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setDuration: (d) => set({ duration: Math.max(1, d) }),
  setFps: (fps) => set({ fps }),
  setResolution: (r) => set({ resolution: r }),
  setMapStyle: (s) => set({ mapStyle: s as any }),
  setProjection: (v) => set({ projection: v }),
  setLightPreset: (v) => set({ lightPreset: v }),
  setMapLanguage: (v) => set({ mapLanguage: v }),
  setAtmosphere: (updates) => set((s) => ({ ...s, ...updates })),
  setLabelVisibility: (key, visible) => set((s) => {
    const map = { road: 'showRoadLabels', place: 'showPlaceLabels', poi: 'showPointOfInterestLabels', transit: 'showTransitLabels' };
    return { [map[key]]: visible } as any;
  }),
  set3dDetails: (key, visible) => set((s) => {
    const map = { landmarks: 'show3dLandmarks', trees: 'show3dTrees', facades: 'show3dFacades' };
    return { [map[key]]: visible } as any;
  }),
  setTerrainEnabled: (v) => set({ terrainEnabled: v, terrainLoading: v }),
  setBuildingsEnabled: (v) => set({ buildingsEnabled: v, buildingsLoading: v }),
  setTerrainExaggeration: (v) => set({ terrainExaggeration: v }),
  setProjectName: (n) => set({ name: n }),

  setMoveModeActive: (v) => set({ isMoveModeActive: v }),
  setHideUI: (v) => set({ hideUI: v }),

  setTerrainLoading: (v) => set({ terrainLoading: v }),
  setBuildingsLoading: (v) => set({ buildingsLoading: v }),

  setIsInspectorOpen: (v) => set({ isInspectorOpen: v }),

  loadFullProject: (project) => set({ ...defaultProject, ...project, terrainLoading: false, buildingsLoading: false, hideUI: false, isInspectorOpen: true }),
}));

export const CAMERA_TRACK_ID = CAMERA_ID;

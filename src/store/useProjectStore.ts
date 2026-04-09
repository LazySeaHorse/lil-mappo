import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Project, TimelineItem, CameraKeyframe, RouteItem, BoundaryItem, CalloutItem, CameraItem, EasingName } from './types';
import type { MapStyleCapabilities } from '@/config/mapbox';
import { MAP_STYLES } from '@/config/mapbox';

interface ProjectStore extends Project {
  // Transient UI state (not persisted)
  mapStyle: string;
  labelVisibility: Record<string, boolean>;
  playheadTime: number;
  isPlaying: boolean;
  isScrubbing: boolean;
  isInspectorOpen: boolean;
  timelineHeight: number;
  terrainLoading: boolean;
  buildingsLoading: boolean;
  detectedCapabilities: MapStyleCapabilities | null;
  // Transient feature toggles (not persisted)
  terrainEnabled: boolean;
  buildingsEnabled: boolean;
  show3dLandmarks: boolean;
  show3dTrees: boolean;
  show3dFacades: boolean;
  // Transient selection state (not persisted)
  selectedItemId: string | null;
  selectedKeyframeId: string | null;
  // Transient UI modes (not persisted)
  isMoveModeActive: boolean;
  hideUI: boolean;
  isExporting: boolean;
  projectSettingsTab: 'general' | 'map';
  // Transient drafting/picking state (not persisted)
  editingRoutePoint: 'start' | 'end' | 'callout' | null;
  editingItemId: string | null;
  draftStart: { lngLat: [number, number]; name: string } | null;
  draftEnd: { lngLat: [number, number]; name: string } | null;
  draftCallout: { lngLat: [number, number]; name: string } | null;
  previewRoute: GeoJSON.FeatureCollection | null;
  previewBoundary: GeoJSON.Geometry | null;
  previewBoundaryStyle: BoundaryItem['style'] | null;
  draftBoundaryName: string;

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
  setIsScrubbing: (v: boolean) => void;

  // Project settings
  setDuration: (d: number) => void;
  setFps: (fps: 30 | 60) => void;
  setResolution: (r: [number, number]) => void;
  setMapStyle: (s: string) => void;
  setProjection: (v: 'globe' | 'mercator') => void;
  setLightPreset: (v: 'day' | 'night' | 'dusk' | 'dawn') => void;
  setAtmosphere: (updates: { starIntensity?: number; fogColor?: string | null }) => void;
  setLabelGroupVisibility: (groupId: string, visible: boolean) => void;
  setAllLabelsVisibility: (visible: boolean) => void;
  set3dDetails: (key: 'landmarks' | 'trees' | 'facades', visible: boolean) => void;
  setTerrainEnabled: (v: boolean) => void;
  setBuildingsEnabled: (v: boolean) => void;
  setTerrainExaggeration: (v: number) => void;
  setProjectName: (n: string) => void;

  // Move Mode (Manual Positioning)
  setMoveModeActive: (v: boolean) => void;

  // Loading indicators (transient UI state)
  setTerrainLoading: (v: boolean) => void;
  setBuildingsLoading: (v: boolean) => void;

  // Zen Mode
  setHideUI: (v: boolean) => void;
  setIsExporting: (v: boolean) => void;

  // Project Settings Tab
  setProjectSettingsTab: (tab: 'general' | 'map') => void;

  // Inspector visibility
  setIsInspectorOpen: (v: boolean) => void;

  // Route Planning
  setEditingRoutePoint: (p: 'start' | 'end' | 'callout' | null) => void;
  setDraftStart: (v: { lngLat: [number, number]; name: string } | null) => void;
  setDraftEnd: (v: { lngLat: [number, number]; name: string } | null) => void;
  setDraftCallout: (v: { lngLat: [number, number]; name: string } | null) => void;
  setEditingItemId: (id: string | null) => void;
  setPreviewRoute: (v: GeoJSON.FeatureCollection | null) => void;

  setPreviewBoundary: (geojson: GeoJSON.Geometry | null, name: string) => void;
  setPreviewBoundaryStyle: (style: Partial<BoundaryItem['style']>) => void;
  clearPreviewBoundary: () => void;

  // Timeline visibility/height
  setTimelineHeight: (v: number) => void;

  // Project loading
  loadFullProject: (project: Project) => void;

  // View state for search proximity
  setMapCenter: (v: [number, number]) => void;

  // Utilities
  duplicateItem: (id: string) => void;

  // Runtime capabilities detection (transient UI state for custom styles)
  setDetectedCapabilities: (caps: MapStyleCapabilities | null) => void;
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
  projection: 'globe',
  lightPreset: 'day',
  starIntensity: 0.6,
  fogColor: null,
  terrainExaggeration: 1.5,
  items: { [CAMERA_ID]: initialCamera },
  itemOrder: [CAMERA_ID],
  mapCenter: [0, 0],
};

// Eagerly initialize standard style capabilities
const STANDARD_STYLE_CAPABILITIES: MapStyleCapabilities = {
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

export const useProjectStore = create<ProjectStore>((set, get) => ({
  ...defaultProject,
  // Transient UI state (not persisted)
  mapStyle: 'standard',
  labelVisibility: {},
  playheadTime: 0,
  isPlaying: false,
  isScrubbing: false,
  isInspectorOpen: true,
  timelineHeight: 256,
  terrainLoading: false,
  buildingsLoading: false,
  detectedCapabilities: STANDARD_STYLE_CAPABILITIES,
  // Transient feature toggles (not persisted)
  terrainEnabled: false,
  buildingsEnabled: false,
  show3dLandmarks: true,
  show3dTrees: true,
  show3dFacades: true,
  // Transient selection state (not persisted)
  selectedItemId: null,
  selectedKeyframeId: null,
  // Transient UI modes (not persisted)
  isMoveModeActive: false,
  hideUI: false,
  isExporting: false,
  projectSettingsTab: 'general' as 'general' | 'map',
  // Transient drafting/picking state (not persisted)
  editingRoutePoint: null,
  editingItemId: null,
  draftStart: null,
  draftEnd: null,
  draftCallout: null,
  previewRoute: null,
  previewBoundary: null,
  previewBoundaryStyle: null,
  draftBoundaryName: '',

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
  setIsScrubbing: (v) => set({ isScrubbing: v }),
  setDuration: (d) => set({ duration: Math.max(1, d) }),
  setFps: (fps) => set({ fps }),
  setResolution: (r) => set({ resolution: r }),
  setMapStyle: (s) => set({ mapStyle: s as any, terrainEnabled: false, buildingsEnabled: false, terrainLoading: false, buildingsLoading: false, detectedCapabilities: null }),
  setProjection: (v) => set({ projection: v }),
  setLightPreset: (v) => set({ lightPreset: v }),
  setAtmosphere: (updates) => set((s) => ({ ...s, ...updates })),
  setLabelGroupVisibility: (groupId, visible) => set((s) => ({
    labelVisibility: { ...s.labelVisibility, [groupId]: visible },
  })),
  setAllLabelsVisibility: (visible) => set((s) => {
    const newVisibility: Record<string, boolean> = {};
    if (s.detectedCapabilities) {
      s.detectedCapabilities.labelGroups.forEach((group) => {
        newVisibility[group.id] = visible;
      });
    }
    return { labelVisibility: newVisibility };
  }),
  set3dDetails: (key, visible) => set((s) => {
    const map = { landmarks: 'show3dLandmarks', trees: 'show3dTrees', facades: 'show3dFacades' };
    return { [map[key]]: visible } as any;
  }),
  setTerrainEnabled: (v) => set({ terrainEnabled: v, terrainLoading: v }),
  setBuildingsEnabled: (v) => set({ buildingsEnabled: v }),
  setTerrainExaggeration: (v) => set({ terrainExaggeration: v }),
  setProjectName: (n) => set({ name: n }),

  setMoveModeActive: (v) => set({ isMoveModeActive: v }),
  setHideUI: (v) => set({ hideUI: v }),
  setIsExporting: (v) => set({ isExporting: v }),
  setProjectSettingsTab: (tab) => set({ projectSettingsTab: tab }),

  setTerrainLoading: (v) => set({ terrainLoading: v }),
  setBuildingsLoading: (v) => set({ buildingsLoading: v }),
  setDetectedCapabilities: (caps) => set({ detectedCapabilities: caps }),

  setIsInspectorOpen: (v) => set({ isInspectorOpen: v }),

  setTimelineHeight: (v) => set({ timelineHeight: v }),

  loadFullProject: (project) => set({
    ...defaultProject,
    ...project,
    // Reset transient UI state to defaults
    mapStyle: 'standard',
    labelVisibility: {},
    playheadTime: 0,
    isPlaying: false,
    isScrubbing: false,
    isInspectorOpen: true,
    timelineHeight: 256,
    terrainLoading: false,
    buildingsLoading: false,
    detectedCapabilities: null,
    // Reset transient feature toggles
    terrainEnabled: false,
    buildingsEnabled: false,
    show3dLandmarks: true,
    show3dTrees: true,
    show3dFacades: true,
    // Reset transient selection state
    selectedItemId: null,
    selectedKeyframeId: null,
    // Reset transient UI modes
    isMoveModeActive: false,
    hideUI: false,
    projectSettingsTab: 'general',
    // Reset transient drafting/picking state
    editingRoutePoint: null,
    editingItemId: null,
    draftStart: null,
    draftEnd: null,
    draftCallout: null,
    previewBoundary: null,
    previewBoundaryStyle: null,
    draftBoundaryName: '',
  }),

  duplicateItem: (id) => set((s) => {
    const original = s.items[id];
    if (!original || original.kind === 'camera') return s;

    const newId = nanoid();
    const newItem = JSON.parse(JSON.stringify(original)) as TimelineItem;
    newItem.id = newId;

    if (newItem.kind === 'route') newItem.name = `${newItem.name} Copy`;
    if (newItem.kind === 'boundary') newItem.placeName = `${newItem.placeName} Copy`;
    if (newItem.kind === 'callout') newItem.title = `${newItem.title} Copy`;

    return {
      items: { ...s.items, [newId]: newItem },
      itemOrder: [...s.itemOrder, newId],
      selectedItemId: newId,
      isInspectorOpen: true,
    };
  }),
  setMapCenter: (v) => set({ mapCenter: v }),
  setEditingRoutePoint: (p) => set({ editingRoutePoint: p }),
  setDraftStart: (v) => set({ draftStart: v }),
  setDraftEnd: (v) => set({ draftEnd: v }),
  setDraftCallout: (v) => set({ draftCallout: v }),
  setEditingItemId: (id) => set({ editingItemId: id }),
  setPreviewRoute: (v) => set({ previewRoute: v }),

  setPreviewBoundary: (geojson, name) => set({ 
    previewBoundary: geojson, 
    draftBoundaryName: name,
    previewBoundaryStyle: get().previewBoundaryStyle || {
      strokeColor: '#a855f7',
      strokeWidth: 5,
      glow: true,
      glowColor: '#a855f7',
      fillColor: '#a855f7',
      fillOpacity: 0.1,
      animateStroke: true,
      animationStyle: 'draw',
      traceLength: 0.1,
    }
  }),
  setPreviewBoundaryStyle: (updates) => set((s) => ({
    previewBoundaryStyle: s.previewBoundaryStyle 
      ? { ...s.previewBoundaryStyle, ...updates } 
      : null
  })),
  clearPreviewBoundary: () => set({ 
    previewBoundary: null, 
    previewBoundaryStyle: null, 
    draftBoundaryName: '' 
  }),
}));

export const CAMERA_TRACK_ID = CAMERA_ID;

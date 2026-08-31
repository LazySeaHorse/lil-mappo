import type { StateCreator } from 'zustand';
import type {
  Project,
  TimelineItem,
  CameraKeyframe,
  BoundaryItem,
} from '../types';
import type { MapStyleCapabilities } from '@/config/mapbox';
import type { AspectRatio, ExportResolution, RenderConfig } from '@/types/render';

export interface PickResult {
  lngLat: [number, number];
  name: string;
}

export interface PickSession {
  id: string;
  prompt?: string;
  onPick: (result: PickResult) => void;
}

export interface TransientProjectState {
  // Transient map runtime state (not persisted)
  mapStyle: string;
  labelVisibility: Record<string, boolean>;
  playheadTime: number;
  isPlaying: boolean;
  isScrubbing: boolean;
  isInspectorOpen: boolean;
  timelineHeight: number;
  terrainLoading: boolean;
  buildingsLoading: boolean;
  isCameraEnabled: boolean;
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
  selectedAutoCamRouteId: string | null;
  // Transient UI modes (not persisted)
  isMoveModeActive: boolean;
  hideUI: boolean;
  isExporting: boolean;
  showNewProjectModal: boolean;
  projectSettingsTab: 'general' | 'map';
  // Transient picking state (not persisted)
  activePicker: PickSession | null;
  previewRoute: GeoJSON.FeatureCollection | null;
  previewBoundary: GeoJSON.Geometry | null;
  previewBoundaryStyle: BoundaryItem['style'] | null;
  draftBoundaryName: string;
}

export interface ItemsSlice {
  addItem: (item: TimelineItem) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, updates: Partial<TimelineItem>) => void;
  reorderItems: (newOrder: string[]) => void;
  duplicateItem: (id: string) => void;
}

export interface CameraSlice {
  addCameraKeyframe: (kf: CameraKeyframe) => void;
  updateCameraKeyframe: (kfId: string, updates: Partial<CameraKeyframe>) => void;
  removeCameraKeyframe: (kfId: string) => void;
  setIsCameraEnabled: (v: boolean) => void;
}

export interface PlaybackSlice {
  setPlayheadTime: (t: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsScrubbing: (v: boolean) => void;
  setDuration: (d: number) => void;
  setFps: (fps: 30 | 60) => void;
}

export interface ProjectSettingsSlice {
  setResolution: (r: [number, number]) => void;
  setAspectRatio: (v: AspectRatio) => void;
  setExportResolution: (v: ExportResolution) => void;
  setIsVertical: (v: boolean) => void;
  setProjection: (v: 'globe' | 'mercator') => void;
  setLightPreset: (v: Project['lightPreset']) => void;
  setStarIntensity: (v: number) => void;
  setFogColor: (v: string) => void;
  setTerrainExaggeration: (v: number) => void;
  setCustomMapStyle: (url?: string, label?: string) => void;
  resetProjectSettings: () => void;
}

export interface MapEnvironmentSlice {
  setMapStyle: (s: string) => void;
  toggleLabelGroup: (groupId: string) => void;
  setLabelGroupVisibility: (groupId: string, visible: boolean) => void;
  setAllLabelsVisibility: (visible: boolean) => void;
  set3dDetails: (key: 'landmarks' | 'trees' | 'facades', visible: boolean) => void;
  setTerrainEnabled: (v: boolean) => void;
  setBuildingsEnabled: (v: boolean) => void;
  setTerrainLoading: (v: boolean) => void;
  setBuildingsLoading: (v: boolean) => void;
  setDetectedCapabilities: (caps: MapStyleCapabilities | null) => void;
  applyRenderConfig: (config: RenderConfig) => void;
}

export interface EditorUiSlice {
  selectItem: (id: string | null) => void;
  selectKeyframe: (id: string | null) => void;
  setSelectedAutoCamRouteId: (id: string | null) => void;
  setMoveModeActive: (v: boolean) => void;
  setHideUI: (v: boolean) => void;
  setIsExporting: (v: boolean) => void;
  setShowNewProjectModal: (v: boolean) => void;
  setProjectSettingsTab: (tab: 'general' | 'map') => void;
  setIsInspectorOpen: (v: boolean) => void;
  setTimelineHeight: (v: number) => void;
  setMapCenter: (v: [number, number]) => void;
  startPicking: (session: PickSession) => void;
  stopPicking: () => void;
  setPreviewRoute: (v: GeoJSON.FeatureCollection | null) => void;
  setPreviewBoundary: (geojson: GeoJSON.Geometry | null, name: string) => void;
  setPreviewBoundaryStyle: (style: Partial<BoundaryItem['style']>) => void;
  clearPreviewBoundary: () => void;
}

export type ProjectStore = Project &
  TransientProjectState &
  ItemsSlice &
  CameraSlice &
  PlaybackSlice &
  ProjectSettingsSlice &
  MapEnvironmentSlice &
  EditorUiSlice;

export type StoreSlice<T> = StateCreator<
  ProjectStore,
  [['zustand/devtools', never]],
  [],
  T
>;

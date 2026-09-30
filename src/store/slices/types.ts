import type { StateCreator } from 'zustand';
import type {
  Project,
  TimelineItem,
  CameraKeyframe,
  BoundaryItem,
  WalkRouteCalculation,
} from '../types';
import type { WalkPatch } from '@/engine/routeCurves';
import type { MapStyleCapabilities } from '@/config/mapbox';
import type { AspectRatio, ExportResolution } from '@/types/render';

export interface PickResult {
  lngLat: [number, number];
  name: string;
}

export interface PickSession {
  id: string;
  /** Item this session edits; the session ends if that item is deleted. */
  ownerId?: string;
  prompt?: string;
  onPick: (result: PickResult) => void;
}

export interface TransientProjectState {
  // Transient map runtime state (not persisted)
  playheadTime: number;
  isPlaying: boolean;
  isScrubbing: boolean;
  isInspectorOpen: boolean;
  timelineHeight: number;
  terrainLoading: boolean;
  isCameraEnabled: boolean;
  detectedCapabilities: MapStyleCapabilities | null;
  // Transient selection state (not persisted)
  selectedItemId: string | null;
  selectedKeyframeId: string | null;
  selectedAutoCamRouteId: string | null;
  // Transient UI modes (not persisted)
  isMoveModeActive: boolean;
  hideUI: boolean;
  isExporting: boolean;
  /** The map is temporarily resized to render a capture (export, snapshot, agent frames). */
  isCapturingViewport: boolean;
  showNewProjectModal: boolean;
  projectSettingsTab: 'general' | 'map';
  // Transient picking state (not persisted)
  activePicker: PickSession | null;
  previewRoute: GeoJSON.FeatureCollection | null;
  /** Walk being built in the Plan Route dropdown; drawn live on the map until inserted. */
  draftWalk: WalkRouteCalculation | null;
  previewBoundary: GeoJSON.Geometry | null;
  previewBoundaryStyle: BoundaryItem['style'] | null;
  draftBoundaryName: string;
}

export interface ItemsSlice {
  addItem: (item: TimelineItem) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, updates: Partial<TimelineItem>) => void;
  /**
   * Edits a walk route's points or curve settings and rebuilds its geometry.
   * Function updates receive the latest stored calculation, so edits that
   * started earlier (map pickers, drags) never overwrite newer changes.
   */
  updateWalkRoute: (id: string, update: WalkPatch | ((calc: WalkRouteCalculation) => WalkPatch)) => void;
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
  /** Replaces the project with a parsed document and resets transient editor state. */
  loadFullProject: (input: unknown) => void;
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
  setDetectedCapabilities: (caps: MapStyleCapabilities | null) => void;
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
  setDraftWalk: (v: WalkRouteCalculation | null) => void;
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

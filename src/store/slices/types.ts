import type {
  Project,
  RouteCalculation,
  TimelineItem,
  CameraKeyframe,
  BoundaryItem,
  ModelAsset,
  ModelItem,
  WalkRouteCalculation,
} from '../types';
import type { FollowCameraResult } from '../followCamera';
import type { BoundaryDetailId } from '@/engine/boundaryDetail';
import type { AppearPreview } from '@/engine/appearPreview';
import type { StagedItem, StagingOwner } from '@/engine/stagedItems';
import type { WalkPatch } from '@/engine/routeCurves';
import type { MapStyleCapabilities } from '@/config/mapbox';
import type { CustomMapStyle } from '@/customMapStyles/model';
import type { AspectRatio, ExportResolution } from '@/types/render';

export interface PickResult {
  lngLat: [number, number];
  /** The coordinates as a label for a place field. Not a place name. */
  name: string;
}

/** A route's path being edited. It stays here, apart from the project, until the user applies it. */
export interface RouteDraft {
  routeId: string;
  calculation: RouteCalculation;
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
  hideUI: boolean;
  /** Preview of the video's frame inside the free space between the panels. View only, never saved. */
  isFitMode: boolean;
  isExporting: boolean;
  /** The map is temporarily resized to render a capture (export, snapshot, agent frames). */
  isCapturingViewport: boolean;
  showNewProjectModal: boolean;
  // Transient picking state (not persisted)
  activePicker: PickSession | null;
  previewRoute: GeoJSON.FeatureCollection | null;
  /** The paths of a hub and spoke plan in the Plan Route dropdown, one per spoke, drawn until inserted. */
  previewSpokes: { id: string; geojson: GeoJSON.FeatureCollection }[];
  /** The spoke whose preview line is highlighted (its row is hovered). */
  previewSpokeFocus: string | null;
  /** Walk being built in the Plan Route dropdown; drawn live on the map until inserted. */
  draftWalk: WalkRouteCalculation | null;
  /** The path editor of the selected route (not persisted, not in undo history). */
  routeDraft: RouteDraft | null;
  /** Detail level for the next boundary added; remembered for the session only. */
  boundaryDetail: BoundaryDetailId;
  /** The entrance of items just added, played a few times over (see `activeAppearPreview`). */
  appearPreview: AppearPreview | null;
  /** What an Add panel shows before it is added: drawn on the map, not in the project (see `sceneItems`). */
  stagedItems: StagedItem[];
  /** The Add panel that staged them; null when nothing is staged. */
  stagedBy: StagingOwner | null;
}

export interface ItemsSlice {
  addItem: (item: TimelineItem) => void;
  /** Adds what `owner` staged to the project at the playhead, in one step, and clears it. Returns what was added. */
  addStagedItems: (owner: StagingOwner) => StagedItem[];
  removeItem: (id: string) => void;
  updateItem: (id: string, updates: Partial<TimelineItem>) => void;
  /**
   * Edits a walk route's points or curve settings and rebuilds its geometry.
   * Function updates receive the latest stored calculation, so edits that
   * started earlier (map pickers, drags) never overwrite newer changes.
   */
  updateWalkRoute: (id: string, update: WalkPatch | ((calc: WalkRouteCalculation) => WalkPatch)) => void;
  /**
   * Turns Follow camera (`autoCam`) on or off for a route. Turning on follows
   * `canEnableFollowCamera`; when the rule says no, nothing changes and the reason comes back.
   * The first time, the camera is fitted to the route; later, it keeps the settings it had.
   */
  setFollowCamera: (routeId: string, on: boolean) => FollowCameraResult;
  reorderItems: (newOrder: string[]) => void;
  duplicateItem: (id: string) => void;
  /**
   * Adds an imported model's metadata (kept if it is already there) and, when given, a placed
   * model item, in one step. The bytes go to the in-memory model registry, never here.
   */
  addModel: (asset: ModelAsset, item?: ModelItem) => void;
  /** Points an imported model at a different file (a relink whose file differs). */
  relinkModel: (assetId: string, file: Omit<ModelAsset, 'id'>) => void;
}

export interface CameraSlice {
  addCameraKeyframe: (kf: CameraKeyframe) => void;
  updateCameraKeyframe: (kfId: string, updates: Partial<CameraKeyframe>) => void;
  removeCameraKeyframe: (kfId: string) => void;
  /**
   * Copies a camera view to 1 s later, or halfway to the next view or the end
   * of the video when that is closer, then selects the copy. Returns the new
   * id, or null when the view is unknown or there is no room after it.
   */
  duplicateCameraKeyframe: (kfId: string) => string | null;
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
  setProjectName: (name: string) => void;
  setAspectRatio: (v: AspectRatio) => void;
  setExportResolution: (v: ExportResolution) => void;
  setIsVertical: (v: boolean) => void;
  setProjection: (v: 'globe' | 'mercator') => void;
  setLightPreset: (v: Project['lightPreset']) => void;
  setAtmosphere: (updates: Partial<Pick<Project, 'starIntensity' | 'fogColor'>>) => void;
  setTerrainExaggeration: (v: number) => void;
  /** Replaces the project with one parsed by `parseProjectDocument` (or made by `createProject`) and resets transient editor state. */
  loadFullProject: (project: Project) => void;
}

export interface MapEnvironmentSlice {
  /** Switches to a built-in style, with `customStyle` colours over it (none by default). */
  setMapStyle: (style: string, customStyle?: CustomMapStyle | null) => void;
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
  setHideUI: (v: boolean) => void;
  setFitMode: (v: boolean) => void;
  setIsExporting: (v: boolean) => void;
  setShowNewProjectModal: (v: boolean) => void;
  setIsInspectorOpen: (v: boolean) => void;
  setTimelineHeight: (v: number) => void;
  setMapCenter: (v: [number, number]) => void;
  startPicking: (session: PickSession) => void;
  stopPicking: () => void;
  setPreviewRoute: (v: GeoJSON.FeatureCollection | null) => void;
  setPreviewSpokes: (v: { id: string; geojson: GeoJSON.FeatureCollection }[]) => void;
  setPreviewSpokeFocus: (id: string | null) => void;
  setDraftWalk: (v: WalkRouteCalculation | null) => void;
  /** Opens a draft that starts as a copy of the route's saved path settings. */
  startRouteDraft: (routeId: string) => void;
  /** Edits the open draft. The function gets the latest draft, so late map picks and drags never overwrite newer edits. */
  updateRouteDraft: (update: (calc: RouteCalculation) => RouteCalculation) => void;
  discardRouteDraft: () => void;
  setBoundaryDetail: (id: BoundaryDetailId) => void;
  /** Plays the entrance of items just added, a few times over, with the selection and playhead as they are now. */
  playAppearPreview: (itemIds: readonly string[]) => void;
  /** Stages `items` for `owner`, replacing whatever was staged. */
  stageItems: (owner: StagingOwner, items: StagedItem[]) => void;
  /** Drops what `owner` staged; leaves another panel's items alone. */
  clearStagedItems: (owner: StagingOwner) => void;
}

export type ProjectStore = Project &
  TransientProjectState &
  ItemsSlice &
  CameraSlice &
  PlaybackSlice &
  ProjectSettingsSlice &
  MapEnvironmentSlice &
  EditorUiSlice;

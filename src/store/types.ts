import type { AspectRatio, ExportResolution } from '@/types/render';
import type { EasingName } from '@/engine/easings';
import type {
  AnnotationContent,
  AnnotationBinding,
  AnchorPosition,
  ConnectorConfig,
  TransitionConfig,
} from '@/annotations/types';

export type { EasingName };

export type AutoCamPreset = 'chase' | 'drone' | 'reveal' | 'topdown';

export interface AutoCamConfig {
  enabled: boolean;
  mode: 'cinematic' | 'navigation';
  /** Follow-view shot style; the sliders below start from the preset and can be tuned. */
  preset?: AutoCamPreset;
  /** 0..1: how much the framing reacts to turns and speed. */
  dynamics?: number;
  /** 0..1: slow sideways drift of the follow camera around the route. */
  orbit?: number;
  /**
   * 0..1: strength of the opening move. Eases in from the previous keyframe, starting at that
   * keyframe and finishing further into the block the higher it is; with no previous keyframe
   * it swoops in from a wide shot.
   */
  intro?: number;
  /**
   * 0..1: strength of the closing move. Eases out to the next keyframe, starting further before
   * the block ends the higher it is and arriving at that keyframe; with no next keyframe it
   * pulls back to frame the route.
   */
  outro?: number;
  /** Degrees from looking straight down, in both views. */
  pitch: number;
  smoothing: number;
  /** Follow view: straight-line metres from the camera to what it looks at. */
  distance: number;
  zoom: number;
  lookAhead: number;
  easing?: EasingName;
}

export type RouteMode = 'car' | 'walk' | 'flight';

export interface RouteVehicleConfig {
  enabled: boolean;
  /** 'custom' rides an imported model: `modelId` is its id in `Project.models`. */
  type: 'car' | 'plane' | 'dot' | 'custom';
  modelId: string;
  scale: number;
}

/** Car and flight paths are computed from two endpoints; [0, 0] means unset. */
export interface EndpointRouteCalculation {
  mode: 'car' | 'flight';
  startPoint: [number, number];
  endPoint: [number, number];
  /** Place names of the endpoints; '' when unknown (map picks, older projects). */
  startName: string;
  endName: string;
  vehicle?: RouteVehicleConfig;
}

/** Walk paths are drawn freehand through an ordered list of points. */
export interface WalkRouteCalculation {
  mode: 'walk';
  points: [number, number][];
  curved: boolean;
  sharpness: number;
  vehicle?: RouteVehicleConfig;
}

export type RouteCalculation = EndpointRouteCalculation | WalkRouteCalculation;

export interface RouteStyle {
  color: string;
  width: number;
  glow: boolean;
  glowWidth: number;
  dashPattern: number[] | null;
  animationType: 'draw' | 'navigation' | 'comet';
  /** Fraction of the route the comet trail covers. */
  cometTrailLength: number;
}

export interface BoundaryStyle {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  glow: boolean;
  fillOpacity: number;
  animateStroke: boolean;
  animationStyle: 'fade' | 'draw' | 'trace';
  traceLength: number;
  /** Paint everything outside this boundary with `maskColor` (a spotlight look). */
  maskOutside: boolean;
  maskColor: string;
  /** 0-1, scaled by the boundary's fill progress. */
  maskOpacity: number;
  /** 'flag' fills the boundary with the flag of `flagCode` instead of the fill colour. */
  fillMode: 'color' | 'flag';
  /** Lowercase ISO 3166-1 alpha-2 code of the flag to fill with; null when none is chosen. */
  flagCode: string | null;
}

/** How a route or boundary leaves at its endTime. 'none' keeps it on screen, fully drawn. */
export type ExitAnimation = 'none' | 'reverse' | 'fade';

export interface RouteItem {
  kind: 'route';
  id: string;
  name: string;
  geojson: GeoJSON.FeatureCollection;
  startTime: number;
  endTime: number;
  autoCam?: AutoCamConfig;
  style: RouteStyle;
  easing: EasingName;
  exitAnimation: ExitAnimation;
  calculation?: RouteCalculation;
}

export interface BoundaryItem {
  kind: 'boundary';
  id: string;
  placeName: string;
  geojson: GeoJSON.Geometry | null;
  startTime: number;
  endTime: number;
  style: BoundaryStyle;
  easing: EasingName;
  exitAnimation: ExitAnimation;
}

export type CalloutSizeMode = 'screen' | 'map';

export interface CalloutItem {
  kind: 'callout';
  id: string;

  /** Style identity — registered in the annotation style registry. */
  styleId: string;
  styleVersion: number;

  /** Semantic content — styles declare which slots they consume. */
  content: AnnotationContent;

  /** Placement on the map or screen. */
  binding: AnnotationBinding;
  offset: [number, number];
  anchor: AnchorPosition;

  /** Timeline timing. */
  startTime: number;
  endTime: number;

  /** Enter/exit transitions. */
  transition: TransitionConfig;

  /** Connector line from card to map point. */
  connector: ConnectorConfig;

  /** Base appearance modifiers. */
  opacity: number;
  scale: number;
  /**
   * 'screen' keeps the callout's pixel size at every zoom. 'map' sizes it like
   * something printed on the map: `scale` is its size at `referenceZoom`, and it
   * grows and shrinks with the zoom from there.
   */
  sizeMode: CalloutSizeMode;
  referenceZoom: number;

  /** Style-specific settings, validated by the style's Zod schema. */
  settings: Record<string, unknown>;

  /** Whether title auto-updates when location changes. */
  linkTitleToLocation: boolean;

  /** Name of the place the callout points at; '' when unknown (map picks, older projects). */
  locationName: string;
}

// Re-export annotation types used by other modules
export type { AnnotationContent, AnnotationBinding, AnchorPosition, ConnectorConfig, TransitionConfig };


export interface CameraKeyframe {
  id: string;
  time: number;
  camera: {
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
    altitude: number | null;
  };
  easing: EasingName;
  followRoute: string | null;
}

export interface CameraItem {
  kind: 'camera';
  id: string;
  keyframes: CameraKeyframe[];
}

/**
 * An imported 3D model (.glb). The file itself never leaves the browser's memory: the project keeps
 * only this metadata, so a reloaded project asks the user to pick the file again (relink).
 */
export interface ModelAsset {
  id: string;
  fileName: string;
  byteSize: number;
  /** SHA-256 of the file, lowercase hex. A relinked file is checked against it. */
  sha256: string;
  /** The web link the file was loaded from. A reloaded project fetches it again instead of asking for the file. */
  sourceUrl?: string;
  /** Bounding box in metres as authored (glTF: y up, facing +z), through every node's transform. */
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

export type ModelEnter = 'none' | 'fade' | 'scale-up' | 'rise';
export type ModelExit = 'none' | 'fade' | 'scale-down' | 'sink';

/** How a placed model appears and disappears; the same shape as a callout's `transition`. */
export interface ModelTransition {
  enter: ModelEnter;
  exit: ModelExit;
  enterDuration: number;
  exitDuration: number;
}

/** An imported 3D model placed on the map. It does not move (no keyframes). */
export interface ModelItem {
  kind: 'model';
  id: string;
  name: string;
  /** Key in `Project.models`. */
  assetId: string;
  /** [lng, lat]. */
  position: [number, number];
  /** Metres from the ground to the model's lowest point. */
  altitude: number;
  /** Degrees clockwise from north. */
  heading: number;
  /** Degrees, nose up. */
  pitch: number;
  /** Degrees, right side down. */
  roll: number;
  /** Multiplier on the model's own size (1 = as authored, in metres). */
  scale: number;
  startTime: number;
  endTime: number;
  transition: ModelTransition;
}

export type TimelineItem = RouteItem | BoundaryItem | CalloutItem | CameraItem | ModelItem;

export interface Project {
  id: string;
  name: string;
  duration: number;
  fps: 30 | 60;
  resolution: [number, number]; // auto-derived from exportResolution + aspectRatio + isVertical; kept for backwards compat
  aspectRatio: AspectRatio;
  exportResolution: ExportResolution;
  isVertical: boolean;
  projection: 'globe' | 'mercator';
  lightPreset: 'day' | 'night' | 'dusk' | 'dawn';
  starIntensity: number;
  fogColor: string | null;
  terrainExaggeration: number;
  /** Key of MAP_STYLES; anything that changes exported pixels lives in the project. */
  mapStyle: string;
  terrainEnabled: boolean;
  buildingsEnabled: boolean;
  /** Label category id -> visible; missing ids use the style default. */
  labelVisibility: Record<string, boolean>;
  show3dLandmarks: boolean;
  show3dTrees: boolean;
  show3dFacades: boolean;
  items: Record<string, TimelineItem>;
  itemOrder: string[];
  /** Metadata of imported 3D models, by id. The bytes are kept in memory only (`src/models`). */
  models: Record<string, ModelAsset>;
  mapCenter: [number, number];
  // Custom map styles (future feature accommodation)
  customMapStyleUrl?: string;
  customMapStyleLabel?: string;
}

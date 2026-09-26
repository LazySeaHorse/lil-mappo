import type { AspectRatio, ExportResolution } from '@/types/render';
import type {
  AnnotationContent,
  AnnotationBinding,
  AnchorPosition,
  ConnectorConfig,
  TransitionConfig,
} from '@/annotations/types';

export type EasingName =
  | 'linear'
  | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad'
  | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
  | 'easeInOutSine'
  | 'bounce';

export interface AutoCamConfig {
  enabled: boolean;
  mode: 'cinematic' | 'navigation';
  pitch: number;
  smoothing: number;
  distance: number;
  height: number;
  zoom: number;
  lookAhead: number;
  easing?: EasingName;
}

export type RouteMode = 'car' | 'walk' | 'flight' | 'manual';

export interface RouteVehicleConfig {
  enabled: boolean;
  type: 'car' | 'plane' | 'dot';
  modelId: string;
  scale: number;
}

export interface RouteCalculation {
  startPoint: [number, number];
  endPoint: [number, number];
  mode: RouteMode;
  vehicle?: RouteVehicleConfig;
}

export interface RouteStyle {
  color: string;
  width: number;
  glow: boolean;
  glowColor: string;
  glowWidth: number;
  trailFade: boolean;
  trailFadeLength: number;
  dashPattern: number[] | null;
  animationType?: 'draw' | 'navigation' | 'comet';
  cometTrailLength?: number;
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
}

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
  exitAnimation?: 'none' | 'reverse' | 'fade';
  calculation?: RouteCalculation;
}

export interface BoundaryItem {
  kind: 'boundary';
  id: string;
  placeName: string;
  geojson: GeoJSON.Geometry | null;
  resolveStatus: 'idle' | 'loading' | 'resolved' | 'error';
  startTime: number;
  endTime: number;
  style: BoundaryStyle;
  easing: EasingName;
  exitAnimation?: 'none' | 'reverse' | 'fade';
}

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

  /** Style-specific settings, validated by the style's Zod schema. */
  settings: Record<string, unknown>;

  /** Whether title auto-updates when location changes. */
  linkTitleToLocation: boolean;
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

export type TimelineItem = RouteItem | BoundaryItem | CalloutItem | CameraItem;

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
  items: Record<string, TimelineItem>;
  itemOrder: string[];
  mapCenter: [number, number];
  // Custom map styles (future feature accommodation)
  customMapStyleUrl?: string;
  customMapStyleLabel?: string;
}

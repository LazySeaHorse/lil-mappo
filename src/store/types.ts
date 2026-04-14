import type { MapStyleKey } from '@/config/mapbox';
import type { AspectRatio, ExportResolution } from '@/types/render';

export type EasingName =
  | 'linear'
  | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad'
  | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
  | 'easeInOutSine';

export interface RouteItem {
  kind: 'route';
  id: string;
  name: string;
  geojson: GeoJSON.FeatureCollection;
  startTime: number;
  endTime: number;
  style: {
    color: string;
    width: number;
    glow: boolean;
    glowWidth: number;
    trailFade: boolean;
    trailFadeLength: number;
    dashPattern: number[] | null;
    animationType?: 'draw' | 'navigation' | 'comet';
    cometTrailLength?: number;
  };
  easing: EasingName;
  exitAnimation?: 'none' | 'reverse' | 'fade';
  calculation?: {
    startPoint: [number, number];
    endPoint: [number, number];
    mode: 'car' | 'flight' | 'manual';
    vehicle?: {
      enabled: boolean;
      type: 'car' | 'plane' | 'dot';
      modelId: string;
      scale: number;
    };
  };
}

export interface BoundaryItem {
  kind: 'boundary';
  id: string;
  placeName: string;
  geojson: GeoJSON.Geometry | null;
  resolveStatus: 'idle' | 'loading' | 'resolved' | 'error';
  startTime: number;
  endTime: number;
  style: {
    strokeColor: string;
    strokeWidth: number;
    glow: boolean;
    fillOpacity: number;
    animateStroke: boolean;
    animationStyle: 'fade' | 'draw' | 'trace';
    traceLength: number;
  };
  easing: EasingName;
  exitAnimation?: 'none' | 'reverse' | 'fade';
}

export interface CalloutItem {
  kind: 'callout';
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  lngLat: [number, number];
  anchor: 'bottom' | 'top' | 'left' | 'right';
  startTime: number;
  endTime: number;
  animation: {
    enter: 'fadeIn' | 'scaleUp' | 'slideUp';
    exit: 'fadeOut' | 'scaleDown' | 'slideDown';
    enterDuration: number;
    exitDuration: number;
  };
  style: {
    bgColor: string;
    textColor: string;
    accentColor: string;
    borderRadius: number;
    shadow: boolean;
    maxWidth: number;
    fontFamily: string;
    variant: 'default' | 'modern' | 'news' | 'topo';
    showMetadata: boolean;
  };
  linkTitleToLocation: boolean;
  altitude: number;
  poleVisible: boolean;
  poleColor: string;
}

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

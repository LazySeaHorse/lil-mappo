import type { MapStyleKey } from '@/config/mapbox';

export interface SearchResult {
  id: string;
  name: string;
  lngLat: [number, number];
  category: string;
}

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
    glowColor: string;
    glowWidth: number;
    trailFade: boolean;
    trailFadeLength: number;
    dashPattern: number[] | null;
  };
  easing: EasingName;
  calculation?: {
    startPoint: [number, number];
    endPoint: [number, number];
    mode: 'car' | 'walk' | 'flight' | 'manual';
    vehicle?: {
      enabled: boolean;
      type: 'car' | 'plane';
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
    glowColor: string;
    fillColor: string;
    fillOpacity: number;
    animateStroke: boolean;
    animationStyle: 'fade' | 'draw' | 'trace';
    traceLength: number;
  };
  easing: EasingName;
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

export interface VideoOverlay {
  id: string;
  kind: 'watermark' | 'text' | 'image';
  enabled: boolean;
  /** Normalized 0–1 coordinates relative to export canvas. Resolution-independent. */
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  // text + watermark label
  text?: string;
  fontFamily?: string;
  /** Logical px at 1080p height — scaled proportionally at export time. */
  fontSize?: number;
  color?: string;
  fontWeight?: 'normal' | 'bold';
  // image overlays only — base64 data URL, max 500KB at import time
  imageDataUrl?: string;
}

export interface Project {
  id: string;
  name: string;
  duration: number;
  fps: 30 | 60;
  resolution: [number, number];
  projection: 'globe' | 'mercator';
  lightPreset: 'day' | 'night' | 'dusk' | 'dawn';
  starIntensity: number;
  fogColor: string | null;
  terrainExaggeration: number;
  items: Record<string, TimelineItem>;
  itemOrder: string[];
  mapCenter: [number, number];
  /** index 0 = topmost z-order (rendered last = on top). Watermark is always index 0. */
  overlays: VideoOverlay[];
  // Custom map styles (future feature accommodation)
  customMapStyleUrl?: string;
  customMapStyleLabel?: string;
}

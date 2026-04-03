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

export interface Project {
  id: string;
  name: string;
  duration: number;
  fps: 30 | 60;
  resolution: [number, number];
  mapStyle: MapStyleKey;
  projection: 'globe' | 'mercator';
  lightPreset: 'day' | 'night' | 'dusk' | 'dawn';
  showRoadLabels: boolean;
  showPlaceLabels: boolean;
  showPointOfInterestLabels: boolean;
  showTransitLabels: boolean;
  show3dLandmarks: boolean;
  show3dTrees: boolean;
  show3dFacades: boolean;
  starIntensity: number;
  fogColor: string | null;
  terrainEnabled: boolean;
  buildingsEnabled: boolean;
  terrainExaggeration: number;
  items: Record<string, TimelineItem>;
  itemOrder: string[];
  playheadTime: number;
  isPlaying: boolean;
  selectedItemId: string | null;
  selectedKeyframeId: string | null;
  isMoveModeActive: boolean;
  hideUI: boolean;
  isInspectorOpen: boolean;
  isScrubbing: boolean;
  timelineHeight: number;
  // Search
  searchResults: SearchResult[];
  hoveredSearchResultId: string | null;
  // Drafting / Picking
  editingRoutePoint: 'start' | 'end' | 'callout' | null;
  editingItemId: string | null;
  draftStart: { lngLat: [number, number]; name: string } | null;
  draftEnd: { lngLat: [number, number]; name: string } | null;
  draftCallout: { lngLat: [number, number]; name: string } | null;
  mapCenter: [number, number];
}

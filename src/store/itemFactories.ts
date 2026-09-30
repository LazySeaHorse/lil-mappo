import { nanoid } from 'nanoid';
import { DEFAULT_VIEW_ZOOM } from '@/annotations/migration';
import { getStyle } from '@/annotations/registry';
import type { AnnotationStyleDefinition } from '@/annotations/types';
import { buildWalkGeometry, createWalkCalculation } from '@/engine/routeCurves';
import type {
  AnnotationContent,
  BoundaryItem,
  BoundaryStyle,
  CalloutItem,
  CameraKeyframe,
  EasingName,
  RouteItem,
  RouteMode,
  RouteStyle,
  RouteVehicleConfig,
} from './types';

/**
 * Default construction of timeline items. The toolbar dropdowns and the AI tool
 * layer both build items here so a route, boundary, callout or keyframe looks
 * the same no matter who created it.
 */

/** Seconds a newly created item lasts on the timeline. */
export const DEFAULT_ITEM_DURATION = 5;

export const DEFAULT_BOUNDARY_STYLE: BoundaryStyle = {
  strokeColor: '#a855f7',
  fillColor: '#a855f7',
  strokeWidth: 5,
  glow: true,
  fillOpacity: 0.1,
  animateStroke: true,
  animationStyle: 'draw',
  traceLength: 0.1,
};

export type RouteStylePreset = RouteMode | 'import';

export function createDefaultRouteStyle(preset: RouteStylePreset): RouteStyle {
  if (preset === 'import') {
    return {
      color: '#22c55e',
      width: 4,
      glow: false,
      glowColor: '#22c55e',
      glowWidth: 12,
      trailFade: false,
      trailFadeLength: 0.3,
      dashPattern: null,
      animationType: 'draw',
      cometTrailLength: 0.2,
    };
  }
  const flight = preset === 'flight';
  return {
    color: flight ? '#f59e0b' : '#3b82f6',
    width: 4,
    glow: true,
    glowColor: flight ? '#fbbf24' : '#3b82f6',
    glowWidth: 12,
    trailFade: false,
    trailFadeLength: 0.3,
    dashPattern: null,
    animationType: 'draw',
    cometTrailLength: 0.2,
  };
}

export function createDefaultVehicle(mode: RouteMode): RouteVehicleConfig {
  return { enabled: true, type: mode === 'flight' ? 'plane' : 'dot', modelId: '', scale: 1 };
}

export function defaultEndpointRouteName(mode: 'car' | 'flight', startName?: string, endName?: string): string {
  if (mode === 'flight') {
    return startName && endName
      ? `${startName} → ${endName}`
      : `${startName || 'Departure'} → ${endName || 'Arrival'}`;
  }
  return `${startName || 'Start'} to ${endName || 'End'}`;
}

export function wrapGeometry(geometry: GeoJSON.Geometry): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry, properties: {} }] };
}

export interface EndpointRouteInput {
  mode: 'car' | 'flight';
  geojson: GeoJSON.FeatureCollection;
  start: [number, number];
  end: [number, number];
  name: string;
  startTime: number;
  endTime?: number;
  id?: string;
}

/** A car or flight route from two endpoints, exactly as the Plan Route dropdown inserts it. */
export function createEndpointRouteItem(input: EndpointRouteInput): RouteItem {
  return {
    kind: 'route',
    id: input.id ?? nanoid(),
    name: input.name,
    geojson: input.geojson,
    startTime: input.startTime,
    endTime: input.endTime ?? input.startTime + DEFAULT_ITEM_DURATION,
    style: createDefaultRouteStyle(input.mode),
    calculation: {
      mode: input.mode,
      startPoint: input.start,
      endPoint: input.end,
      vehicle: createDefaultVehicle(input.mode),
    },
    easing: 'easeInOutQuad',
  };
}

export interface WalkRouteInput {
  points: [number, number][];
  curved?: boolean;
  name?: string;
  startTime: number;
  endTime?: number;
  id?: string;
}

/** A freehand walk route, exactly as the Plan Route dropdown inserts it. */
export function createWalkRouteItem(input: WalkRouteInput): RouteItem {
  const calculation = {
    ...createWalkCalculation(input.points, createDefaultVehicle('walk')),
    curved: input.curved ?? true,
  };
  return {
    kind: 'route',
    id: input.id ?? nanoid(),
    name: input.name ?? 'Walk path',
    geojson: buildWalkGeometry(calculation),
    startTime: input.startTime,
    endTime: input.endTime ?? input.startTime + DEFAULT_ITEM_DURATION,
    style: createDefaultRouteStyle('walk'),
    calculation,
    easing: 'easeInOutQuad',
  };
}

export interface BoundaryInput {
  placeName: string;
  geojson: GeoJSON.Geometry | null;
  startTime: number;
  endTime?: number;
  style?: BoundaryStyle;
  id?: string;
}

export function createBoundaryItem(input: BoundaryInput): BoundaryItem {
  return {
    kind: 'boundary',
    id: input.id ?? nanoid(),
    placeName: input.placeName,
    geojson: input.geojson,
    resolveStatus: 'resolved',
    startTime: input.startTime,
    endTime: input.endTime ?? input.startTime + DEFAULT_ITEM_DURATION,
    style: { ...(input.style ?? DEFAULT_BOUNDARY_STYLE) },
    easing: 'easeInOutCubic',
  };
}

/** Style new callouts use unless one is chosen. */
export const DEFAULT_CALLOUT_STYLE_ID = 'leader-line';

export interface CalloutInput {
  styleId: string;
  content: AnnotationContent;
  lngLat: [number, number];
  startTime: number;
  endTime?: number;
  linkTitleToLocation?: boolean;
  /** Map zoom that size-with-map callouts are sized at. */
  referenceZoom?: number;
  id?: string;
}

/**
 * The parts of a callout that come from its style: settings, placement,
 * connector and transition defaults. Shared by new callouts and by migrations
 * that move a callout onto another style.
 */
export function createCalloutStyleDefaults(style: AnnotationStyleDefinition): Pick<
  CalloutItem,
  'styleId' | 'styleVersion' | 'settings' | 'offset' | 'anchor' | 'transition' | 'connector'
> & { altitude: number } {
  return {
    styleId: style.id,
    styleVersion: style.version,
    settings: { ...style.defaultSettings } as Record<string, unknown>,
    altitude: style.supportsAltitude === false ? 0 : style.defaultAltitude ?? 40,
    offset: [...(style.defaultOffset ?? [0, 0])],
    anchor: style.defaultAnchor ?? (style.category === 'marker' ? 'center' : 'bottom'),
    transition: {
      enter: style.defaultTransition?.enter ?? 'fade',
      exit: style.defaultTransition?.exit ?? 'fade',
      enterDuration: style.defaultTransition?.enterDuration ?? 0.4,
      exitDuration: style.defaultTransition?.exitDuration ?? 0.3,
    },
    connector: {
      visible: style.defaultConnector?.visible ?? true,
      style: 'dashed',
      color: '#94a3b8',
      width: 2,
      endDot: true,
      endDotRadius: 3,
      ...style.defaultConnector,
    },
  };
}

/** Returns null when the style is not registered. */
export function createCalloutItem(input: CalloutInput): CalloutItem | null {
  const style = getStyle(input.styleId);
  if (!style) return null;
  const { altitude, ...defaults } = createCalloutStyleDefaults(style);
  return {
    kind: 'callout',
    id: input.id ?? nanoid(),
    content: input.content,
    binding: { kind: 'geographic', lngLat: input.lngLat, altitude },
    startTime: input.startTime,
    endTime: input.endTime ?? input.startTime + DEFAULT_ITEM_DURATION,
    opacity: 1,
    scale: 1,
    sizeMode: 'screen',
    referenceZoom: input.referenceZoom ?? DEFAULT_VIEW_ZOOM,
    linkTitleToLocation: input.linkTitleToLocation ?? true,
    ...defaults,
  };
}

export interface CameraKeyframeInput {
  time: number;
  center: [number, number];
  zoom: number;
  pitch?: number;
  bearing?: number;
  easing?: EasingName;
  id?: string;
}

export function createCameraKeyframe(input: CameraKeyframeInput): CameraKeyframe {
  return {
    id: input.id ?? nanoid(),
    time: input.time,
    camera: {
      center: input.center,
      zoom: input.zoom,
      pitch: input.pitch ?? 0,
      bearing: input.bearing ?? 0,
      altitude: null,
    },
    easing: input.easing ?? 'easeInOutCubic',
    followRoute: null,
  };
}

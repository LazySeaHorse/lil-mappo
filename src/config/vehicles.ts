import type { AutoCamConfig, AutoCamPreset, EasingName, RouteItem, RouteVehicleConfig } from '@/store/types';
import { extractLineCoords } from '@/engine/geoUtils';
import { getRoutePath } from '@/engine/routePath';

export type VehicleType = RouteVehicleConfig['type'];

/**
 * Normalizes each 3D model's native size so that vehicle.scale = 1 looks
 * consistent across vehicle types. The plane model is tiny at the zooms
 * flights are viewed at, so it is drawn 100x larger.
 */
export const MODEL_BASE_SCALE: Record<Exclude<VehicleType, 'dot'>, number> = {
  car: 1,
  plane: 100,
};

/**
 * Size multiplier limits per marker type, for a log slider. A car is about 3.4 m long at 1x and a
 * plane about 3.7 km (after the 100x above), so the car tops out near a mid-sized city (~35 km) and
 * the plane near a large state (~190 km). The dot is a screen-space circle, so it stays small.
 */
export const VEHICLE_SCALE_RANGE: Record<VehicleType, { min: number; max: number }> = {
  dot: { min: 0.2, max: 10 },
  car: { min: 0.2, max: 10000 },
  plane: { min: 0.2, max: 50 },
};

export function clampVehicleScale(type: VehicleType | undefined, scale: number): number {
  const { min, max } = VEHICLE_SCALE_RANGE[type ?? 'dot'];
  return Math.min(max, Math.max(min, scale));
}

/**
 * Each 3D model's size in metres as authored, before MODEL_BASE_SCALE: nose to tail, and how far its
 * furthest corner reaches from the origin it rides the route on. Measured from the .glb files, which
 * vehicles.test.ts reads to keep these in step.
 */
export const MODEL_SIZE_M: Record<Exclude<VehicleType, 'dot'>, { length: number; reach: number }> = {
  car: { length: 3.43, reach: 2.39 },
  plane: { length: 37.24, reach: 32.75 },
};

/** The 3D marker as drawn, in metres; null for the dot, a fixed-size circle on screen, or no marker. */
export function markerSize(vehicle: RouteVehicleConfig | undefined): { lengthM: number; reachM: number } | null {
  if (!vehicle?.enabled || vehicle.type === 'dot') return null;
  const s = (vehicle.scale || 1) * MODEL_BASE_SCALE[vehicle.type];
  const { length, reach } = MODEL_SIZE_M[vehicle.type];
  return { lengthM: length * s, reachM: reach * s };
}

/** How much larger the auto-camera follow framing is for a vehicle type. */
export function autoCamScaleFor(type: VehicleType | undefined): number {
  return type === 'plane' ? MODEL_BASE_SCALE.plane : 1;
}

interface SliderRange {
  min: number;
  max: number;
  step: number;
}

export interface AutoCamRanges {
  distance: SliderRange;
}

// Wide enough for a long route played fast, where fitting the camera to the route puts it km out.
const BASE_AUTO_CAM_RANGES: AutoCamRanges = {
  distance: { min: 100, max: 25000, step: 50 },
};

/** Follow distance range (metres) for a vehicle type. */
export function getAutoCamRanges(type: VehicleType | undefined): AutoCamRanges {
  const scale = autoCamScaleFor(type);
  const { min, max, step } = BASE_AUTO_CAM_RANGES.distance;
  return { distance: { min: min * scale, max: max * scale, step: step * scale } };
}

const BASE_AUTO_CAM_DEFAULTS: AutoCamConfig = {
  enabled: true,
  mode: 'cinematic',
  preset: 'chase',
  dynamics: 0.5,
  orbit: 0,
  intro: 0,
  outro: 0,
  pitch: 60,
  smoothing: 0.3,
  distance: 600,
  zoom: 14,
  lookAhead: 300,
  easing: 'easeInOutSine' as EasingName,
};

/** Default auto-camera settings for a vehicle type. */
export function defaultAutoCamFor(type: VehicleType | undefined): AutoCamConfig {
  const scale = autoCamScaleFor(type);
  return {
    ...BASE_AUTO_CAM_DEFAULTS,
    distance: BASE_AUTO_CAM_DEFAULTS.distance * scale,
  };
}

interface AutoCamPresetSpec {
  label: string;
  description: string;
  /** Multiplier on the vehicle's default follow distance. */
  distance: number;
  /** Degrees from looking straight down. */
  pitch: number;
  smoothing: number;
  dynamics: number;
  orbit: number;
  intro: number;
  outro: number;
}

export const AUTO_CAM_PRESETS: Record<AutoCamPreset, AutoCamPresetSpec> = {
  chase: {
    label: 'Chase',
    description: 'Steady camera behind the vehicle.',
    distance: 1, pitch: 60, smoothing: 0.4, dynamics: 0.5, orbit: 0, intro: 0, outro: 0,
  },
  drone: {
    label: 'Drone',
    description: 'Higher and wider, drifting around the route.',
    distance: 1.6, pitch: 47, smoothing: 0.55, dynamics: 0.6, orbit: 0.6, intro: 0.4, outro: 0.3,
  },
  reveal: {
    label: 'Reveal',
    description: 'Swoops in from a wide shot, pulls back to frame the route.',
    distance: 1.15, pitch: 53, smoothing: 0.5, dynamics: 0.7, orbit: 0.2, intro: 1, outro: 1,
  },
  topdown: {
    label: 'Top-down',
    description: 'Almost straight overhead, turning with the route.',
    distance: 2.5, pitch: 4, smoothing: 0.7, dynamics: 0.3, orbit: 0, intro: 0, outro: 0.4,
  },
};

const clamp = (value: number, { min, max }: SliderRange) => Math.min(max, Math.max(min, value));
const fitRange = (value: number, range: SliderRange) => clamp(Math.round(value / range.step) * range.step, range);

/** What the auto-camera's framing is fitted to: how long the route is and how long it plays. */
export interface RouteFit {
  lengthM: number;
  duration: number;
}

export function routeFitOf(route: Pick<RouteItem, 'geojson' | 'startTime' | 'endTime'>): RouteFit {
  const { lengthM } = getRoutePath(extractLineCoords(route.geojson));
  return { lengthM, duration: route.endTime - route.startTime };
}

/** Seconds a fitted camera takes the vehicle, at its average speed, to cross the shot. */
const SECONDS_ACROSS_VIEW = 2;

/**
 * How much further out than the vehicle's default framing the camera sits so the route reads at
 * the pace it plays: a long route crossed in seconds needs a camera kilometres away. Never closer
 * than the default, which is framed for the vehicle model.
 */
function routeScale(type: VehicleType | undefined, fit: RouteFit | undefined): number {
  if (!fit || !(fit.lengthM > 0) || !(fit.duration > 0)) return 1;
  const base = defaultAutoCamFor(type);
  return Math.max(1, ((fit.lengthM / fit.duration) * SECONDS_ACROSS_VIEW) / base.distance);
}

/**
 * Item patch that switches a follow-view auto-camera to a preset for a vehicle type, with its
 * distance fitted to the route when `fit` is given.
 */
export function autoCamPresetPatch(
  preset: AutoCamPreset,
  type: VehicleType | undefined,
  fit?: RouteFit,
): Partial<AutoCamConfig> {
  const spec = AUTO_CAM_PRESETS[preset];
  const base = defaultAutoCamFor(type);
  const ranges = getAutoCamRanges(type);
  const scale = routeScale(type, fit);
  return {
    preset,
    distance: fitRange(base.distance * spec.distance * scale, ranges.distance),
    pitch: spec.pitch,
    smoothing: spec.smoothing,
    dynamics: spec.dynamics,
    orbit: spec.orbit,
    intro: spec.intro,
    outro: spec.outro,
  };
}

/** A fresh, enabled auto-camera for a route, on the default preset and fitted to the route. */
export function autoCamForRoute(route: RouteItem): AutoCamConfig {
  const type = route.calculation?.vehicle?.type;
  return { ...defaultAutoCamFor(type), ...autoCamPresetPatch('chase', type, routeFitOf(route)), enabled: true };
}

/**
 * Rescales follow distance when a route's vehicle type changes,
 * keeping the same framing relative to the model and staying within the new
 * type's slider range.
 */
export function rescaleAutoCam(
  config: AutoCamConfig,
  from: VehicleType | undefined,
  to: VehicleType | undefined,
): AutoCamConfig {
  const factor = autoCamScaleFor(to) / autoCamScaleFor(from);
  if (factor === 1) return config;
  return { ...config, distance: clamp(Math.round(config.distance * factor), getAutoCamRanges(to).distance) };
}

/**
 * Builds the item patch for replacing a route's vehicle. Every vehicle change
 * must go through here so the auto-camera stays in the new vehicle's range.
 */
export function vehicleChangePatch(
  route: RouteItem,
  calculation: NonNullable<RouteItem['calculation']>,
  vehicle: RouteVehicleConfig,
): Partial<RouteItem> {
  const previousType = route.calculation?.vehicle?.type;
  return {
    calculation: { ...calculation, vehicle },
    ...(route.autoCam ? { autoCam: rescaleAutoCam(route.autoCam, previousType, vehicle.type) } : {}),
  };
}

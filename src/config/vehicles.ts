import distance from '@turf/distance';
import { point } from '@turf/helpers';
import type { AutoCamConfig, AutoCamPreset, EasingName, RouteItem, RouteVehicleConfig } from '@/store/types';
import { extractLineCoords } from '@/engine/geoUtils';

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
  height: SliderRange;
}

// Wide enough for a long route played fast, where fitting the camera to the route puts it km out.
const BASE_AUTO_CAM_RANGES: AutoCamRanges = {
  distance: { min: 100, max: 20000, step: 50 },
  height: { min: 50, max: 15000, step: 50 },
};

/** Follow distance and height ranges (metres) for a vehicle type. */
export function getAutoCamRanges(type: VehicleType | undefined): AutoCamRanges {
  const scale = autoCamScaleFor(type);
  const scaled = (r: SliderRange): SliderRange => ({ min: r.min * scale, max: r.max * scale, step: r.step * scale });
  return { distance: scaled(BASE_AUTO_CAM_RANGES.distance), height: scaled(BASE_AUTO_CAM_RANGES.height) };
}

const BASE_AUTO_CAM_DEFAULTS: AutoCamConfig = {
  enabled: true,
  mode: 'cinematic',
  preset: 'chase',
  dynamics: 0.5,
  orbit: 0,
  intro: 0,
  outro: 0,
  pitch: 65,
  smoothing: 0.3,
  distance: 500,
  height: 300,
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
    height: BASE_AUTO_CAM_DEFAULTS.height * scale,
  };
}

interface AutoCamPresetSpec {
  label: string;
  description: string;
  /** Multipliers on the vehicle's default follow distance and height. */
  distance: number;
  height: number;
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
    distance: 1, height: 1, smoothing: 0.4, dynamics: 0.5, orbit: 0, intro: 0, outro: 0,
  },
  drone: {
    label: 'Drone',
    description: 'Higher and wider, drifting around the route.',
    distance: 1.4, height: 2.2, smoothing: 0.55, dynamics: 0.6, orbit: 0.6, intro: 0.4, outro: 0.3,
  },
  reveal: {
    label: 'Reveal',
    description: 'Swoops in from a wide shot, pulls back to frame the route.',
    distance: 1.1, height: 1.4, smoothing: 0.5, dynamics: 0.7, orbit: 0.2, intro: 1, outro: 1,
  },
  topdown: {
    label: 'Top-down',
    description: 'Almost straight overhead, turning with the route.',
    distance: 0.2, height: 5, smoothing: 0.7, dynamics: 0.3, orbit: 0, intro: 0, outro: 0.4,
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
  const coords = extractLineCoords(route.geojson);
  let lengthM = 0;
  for (let i = 1; i < coords.length; i++) lengthM += distance(point(coords[i - 1]), point(coords[i]), { units: 'meters' });
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
  return Math.max(1, ((fit.lengthM / fit.duration) * SECONDS_ACROSS_VIEW) / Math.hypot(base.distance, base.height));
}

/**
 * Item patch that switches a follow-view auto-camera to a preset for a vehicle type, with its
 * distance and height fitted to the route when `fit` is given.
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
    height: fitRange(base.height * spec.height * scale, ranges.height),
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
 * Rescales follow distance and height when a route's vehicle type changes,
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
  const ranges = getAutoCamRanges(to);
  return {
    ...config,
    distance: clamp(Math.round(config.distance * factor), ranges.distance),
    height: clamp(Math.round(config.height * factor), ranges.height),
  };
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

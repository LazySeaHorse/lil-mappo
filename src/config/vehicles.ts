import type { AutoCamConfig, EasingName, RouteItem, RouteVehicleConfig } from '@/store/types';

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

const BASE_AUTO_CAM_RANGES: AutoCamRanges = {
  distance: { min: 100, max: 3000, step: 50 },
  height: { min: 50, max: 2000, step: 50 },
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

const clamp = (value: number, { min, max }: SliderRange) => Math.min(max, Math.max(min, value));

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

/**
 * The callout size slider is logarithmic, so equal steps are equal ratios: the
 * slider position t in [-1, 1] maps to scale = 4^t, from 0.25x to 4x with 1x
 * at the centre.
 */

export const SIZE_SLIDER_MIN = -1;
export const SIZE_SLIDER_MAX = 1;
export const SIZE_SLIDER_STEP = 0.01;

/** The scale each end of the slider stands for. */
const SCALE_BASE = 4;

const clampPosition = (t: number) => Math.min(SIZE_SLIDER_MAX, Math.max(SIZE_SLIDER_MIN, t));

export function sliderToScale(position: number): number {
  return SCALE_BASE ** clampPosition(position);
}

/** Inverse of sliderToScale. Scales outside 0.25x..4x (e.g. set by an agent) pin to the ends. */
export function scaleToSlider(scale: number): number {
  if (!(scale > 0)) return SIZE_SLIDER_MIN;
  return clampPosition(Math.log(scale) / Math.log(SCALE_BASE));
}

/** Readout such as "1.0×"; finer below 1x, where steps are smaller. */
export function formatScale(scale: number): string {
  return `${scale.toFixed(scale < 1 ? 2 : 1)}×`;
}

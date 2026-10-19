/**
 * Timeline zoom is a scale, so it moves by factors: each step multiplies the
 * pixels per second, and the slider is logarithmic so equal slider distances
 * are equal zoom factors.
 */
export const MIN_PIXELS_PER_SECOND = 10;
export const MAX_PIXELS_PER_SECOND = 300;
/** What one press of the zoom in button multiplies by, and the zoom out button divides by. */
export const ZOOM_BUTTON_FACTOR = 1.25;
/** Slider positions run 0 to this, which is fine enough that a drag looks smooth. */
export const ZOOM_SLIDER_MAX = 1000;

const WHEEL_ZOOM_PER_DELTA = 0.01;
const ZOOM_RANGE = MAX_PIXELS_PER_SECOND / MIN_PIXELS_PER_SECOND;

export function clampZoom(pixelsPerSecond: number): number {
  return Math.max(MIN_PIXELS_PER_SECOND, Math.min(MAX_PIXELS_PER_SECOND, pixelsPerSecond));
}

export function zoomBy(pixelsPerSecond: number, factor: number): number {
  return clampZoom(pixelsPerSecond * factor);
}

/** The factor for a ctrl+wheel scroll: up zooms in, down zooms out, in proportion to the scroll. */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * WHEEL_ZOOM_PER_DELTA);
}

/** Where a zoom sits on the slider, from 0 (least zoomed) to 1 (most). */
export function zoomToSlider(pixelsPerSecond: number): number {
  return Math.log(clampZoom(pixelsPerSecond) / MIN_PIXELS_PER_SECOND) / Math.log(ZOOM_RANGE);
}

/** The zoom at a slider position from 0 to 1. */
export function sliderToZoom(position: number): number {
  return MIN_PIXELS_PER_SECOND * ZOOM_RANGE ** Math.max(0, Math.min(1, position));
}

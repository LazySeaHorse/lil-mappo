/**
 * Timeline zoom is a scale, so it moves by factors: each step multiplies the
 * pixels per second, and the slider is logarithmic so equal slider distances
 * are equal zoom factors. The range follows the project: zoomed all the way
 * out the whole project fits the panel, all the way in a frame is wide enough
 * to work with.
 */
export interface ZoomBounds {
  min: number;
  max: number;
}

/** How wide one frame is at the most zoomed in. */
export const FRAME_PIXELS = 24;
/** The least zoomed out, so a very long project still gets a usable ruler. */
export const MIN_ZOOM_FLOOR = 0.5;
/** The zoom range never gets narrower than this factor, however short the project. */
const MIN_ZOOM_RANGE = 4;
/** Scrollbar padding that the timeline's ruler does not get, besides the gutter. */
const SCROLLBAR_PADDING = 24;
/** What one press of the zoom in button multiplies by, and the zoom out button divides by. */
export const ZOOM_BUTTON_FACTOR = 1.25;
/** Slider positions run 0 to this, which is fine enough that a drag looks smooth. */
export const ZOOM_SLIDER_MAX = 1000;

const WHEEL_ZOOM_PER_DELTA = 0.01;

/** The zoom at which the whole duration fits a panel of this width, past a gutter this wide. */
export function fitZoom(panelWidth: number, duration: number, gutterWidth: number): number {
  if (duration <= 0) return 0;
  return (panelWidth - gutterWidth - SCROLLBAR_PADDING) / duration;
}

export function zoomBounds(fit: number, fps: number): ZoomBounds {
  const max = fps * FRAME_PIXELS;
  return { min: Math.max(MIN_ZOOM_FLOOR, Math.min(fit, max / MIN_ZOOM_RANGE)), max };
}

export function clampZoom(pixelsPerSecond: number, { min, max }: ZoomBounds): number {
  return Math.max(min, Math.min(max, pixelsPerSecond));
}

export function zoomBy(pixelsPerSecond: number, factor: number, bounds: ZoomBounds): number {
  return clampZoom(pixelsPerSecond * factor, bounds);
}

/** The factor for a ctrl+wheel scroll: up zooms in, down zooms out, in proportion to the scroll. */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * WHEEL_ZOOM_PER_DELTA);
}

/** Where a zoom sits on the slider, from 0 (least zoomed) to 1 (most). */
export function zoomToSlider(pixelsPerSecond: number, bounds: ZoomBounds): number {
  return Math.log(clampZoom(pixelsPerSecond, bounds) / bounds.min) / Math.log(bounds.max / bounds.min);
}

/** The zoom at a slider position from 0 to 1. */
export function sliderToZoom(position: number, bounds: ZoomBounds): number {
  return bounds.min * (bounds.max / bounds.min) ** Math.max(0, Math.min(1, position));
}

import { describe, expect, it } from 'vitest';
import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  ZOOM_BUTTON_FACTOR,
  clampZoom,
  sliderToZoom,
  wheelZoomFactor,
  zoomBy,
  zoomToSlider,
} from './timelineZoom';

describe('timeline zoom slider', () => {
  it('runs from the least to the most zoomed', () => {
    expect(sliderToZoom(0)).toBeCloseTo(MIN_PIXELS_PER_SECOND);
    expect(sliderToZoom(1)).toBeCloseTo(MAX_PIXELS_PER_SECOND);
  });

  it('puts the geometric middle at the middle of the slider', () => {
    expect(sliderToZoom(0.5)).toBeCloseTo(Math.sqrt(MIN_PIXELS_PER_SECOND * MAX_PIXELS_PER_SECOND));
  });

  it('gives equal slider distances equal zoom factors', () => {
    const factors = [0, 0.25, 0.5, 0.75].map((t) => sliderToZoom(t + 0.25) / sliderToZoom(t));
    for (const factor of factors) expect(factor).toBeCloseTo(factors[0]);
  });

  it('maps a zoom to the slider and back', () => {
    for (const pps of [10, 24, 60, 133, 300]) {
      expect(sliderToZoom(zoomToSlider(pps))).toBeCloseTo(pps);
    }
  });

  it('keeps out-of-range zooms and slider values on the track', () => {
    expect(zoomToSlider(1)).toBe(0);
    expect(zoomToSlider(5000)).toBe(1);
    expect(sliderToZoom(-1)).toBeCloseTo(MIN_PIXELS_PER_SECOND);
    expect(sliderToZoom(2)).toBeCloseTo(MAX_PIXELS_PER_SECOND);
  });
});

describe('timeline zoom steps', () => {
  it('clamps a zoom to the range', () => {
    expect(clampZoom(1)).toBe(MIN_PIXELS_PER_SECOND);
    expect(clampZoom(1e6)).toBe(MAX_PIXELS_PER_SECOND);
    expect(clampZoom(60)).toBe(60);
  });

  it('scales by a factor and stops at the ends', () => {
    expect(zoomBy(60, ZOOM_BUTTON_FACTOR)).toBeCloseTo(60 * ZOOM_BUTTON_FACTOR);
    expect(zoomBy(MAX_PIXELS_PER_SECOND, ZOOM_BUTTON_FACTOR)).toBe(MAX_PIXELS_PER_SECOND);
    expect(zoomBy(MIN_PIXELS_PER_SECOND, 1 / ZOOM_BUTTON_FACTOR)).toBe(MIN_PIXELS_PER_SECOND);
  });

  it('undoes a zoom in with a zoom out', () => {
    expect(zoomBy(zoomBy(60, ZOOM_BUTTON_FACTOR), 1 / ZOOM_BUTTON_FACTOR)).toBeCloseTo(60);
  });

  it('zooms in on a wheel scroll up, out on a scroll down, by a factor that grows with the scroll', () => {
    expect(wheelZoomFactor(-20)).toBeGreaterThan(1);
    expect(wheelZoomFactor(20)).toBeLessThan(1);
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(-40)).toBeCloseTo(wheelZoomFactor(-20) ** 2);
  });
});

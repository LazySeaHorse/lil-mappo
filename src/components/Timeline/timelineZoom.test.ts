import { describe, expect, it } from 'vitest';
import {
  FRAME_PIXELS,
  MIN_ZOOM_FLOOR,
  ZOOM_BUTTON_FACTOR,
  clampZoom,
  fitZoom,
  sliderToZoom,
  wheelZoomFactor,
  zoomBounds,
  zoomBy,
  zoomToSlider,
} from './timelineZoom';

const bounds = { min: 20, max: 720 };

describe('zoomBounds', () => {
  it('runs from the whole project fitting to a frame being FRAME_PIXELS wide', () => {
    expect(zoomBounds(100, 30)).toEqual({ min: 100, max: 30 * FRAME_PIXELS });
    expect(zoomBounds(100, 60)).toEqual({ min: 100, max: 60 * FRAME_PIXELS });
  });

  it('never zooms out past a floor, however long the project is', () => {
    expect(zoomBounds(0.001, 30).min).toBe(MIN_ZOOM_FLOOR);
    expect(zoomBounds(-50, 30).min).toBe(MIN_ZOOM_FLOOR);
  });

  it('keeps room to zoom in on a project so short it fits at a very high zoom', () => {
    const { min, max } = zoomBounds(100000, 30);
    expect(max / min).toBeGreaterThanOrEqual(4);
  });
});

describe('fitZoom', () => {
  it('fits the duration into the panel past the gutter and scrollbar padding', () => {
    expect(fitZoom(1088, 10, 64)).toBe(100);
    expect(fitZoom(1056, 10, 32)).toBe(100);
  });

  it('is the floor when there is nothing to fit', () => {
    expect(fitZoom(0, 10, 32)).toBeLessThanOrEqual(0);
    expect(zoomBounds(fitZoom(0, 10, 32), 30).min).toBe(MIN_ZOOM_FLOOR);
    expect(zoomBounds(fitZoom(1184, 0, 32), 30).min).toBe(MIN_ZOOM_FLOOR);
  });
});

describe('timeline zoom slider', () => {
  it('runs from the least to the most zoomed', () => {
    expect(sliderToZoom(0, bounds)).toBeCloseTo(bounds.min);
    expect(sliderToZoom(1, bounds)).toBeCloseTo(bounds.max);
  });

  it('puts the geometric middle at the middle of the slider', () => {
    expect(sliderToZoom(0.5, bounds)).toBeCloseTo(Math.sqrt(bounds.min * bounds.max));
  });

  it('gives equal slider distances equal zoom factors', () => {
    const factors = [0, 0.25, 0.5, 0.75].map((t) => sliderToZoom(t + 0.25, bounds) / sliderToZoom(t, bounds));
    for (const factor of factors) expect(factor).toBeCloseTo(factors[0]);
  });

  it('maps a zoom to the slider and back', () => {
    for (const pps of [20, 45, 133, 400, 720]) {
      expect(sliderToZoom(zoomToSlider(pps, bounds), bounds)).toBeCloseTo(pps);
    }
  });

  it('keeps out-of-range zooms and slider values on the track', () => {
    expect(zoomToSlider(1, bounds)).toBe(0);
    expect(zoomToSlider(5000, bounds)).toBe(1);
    expect(sliderToZoom(-1, bounds)).toBeCloseTo(bounds.min);
    expect(sliderToZoom(2, bounds)).toBeCloseTo(bounds.max);
  });
});

describe('timeline zoom steps', () => {
  it('clamps a zoom to the bounds', () => {
    expect(clampZoom(1, bounds)).toBe(bounds.min);
    expect(clampZoom(1e6, bounds)).toBe(bounds.max);
    expect(clampZoom(60, bounds)).toBe(60);
  });

  it('scales by a factor and stops at the ends', () => {
    expect(zoomBy(60, ZOOM_BUTTON_FACTOR, bounds)).toBeCloseTo(60 * ZOOM_BUTTON_FACTOR);
    expect(zoomBy(bounds.max, ZOOM_BUTTON_FACTOR, bounds)).toBe(bounds.max);
    expect(zoomBy(bounds.min, 1 / ZOOM_BUTTON_FACTOR, bounds)).toBe(bounds.min);
  });

  it('zooms in on a wheel scroll up, out on a scroll down, by a factor that grows with the scroll', () => {
    expect(wheelZoomFactor(-20)).toBeGreaterThan(1);
    expect(wheelZoomFactor(20)).toBeLessThan(1);
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(-40)).toBeCloseTo(wheelZoomFactor(-20) ** 2);
  });
});

import { describe, it, expect } from 'vitest';
import { formatScale, scaleToSlider, sliderToScale } from './sizeSlider';

describe('size slider', () => {
  it('maps the slider ends and centre to 0.25x, 4x and 1x', () => {
    expect(sliderToScale(-1)).toBeCloseTo(0.25);
    expect(sliderToScale(0)).toBe(1);
    expect(sliderToScale(1)).toBeCloseTo(4);
  });

  it('is logarithmic: equal steps are equal ratios', () => {
    expect(sliderToScale(0.5) / sliderToScale(0)).toBeCloseTo(sliderToScale(-0.5) ** -1);
    expect(sliderToScale(0.5)).toBeCloseTo(2);
  });

  it('inverts the mapping', () => {
    for (const t of [-1, -0.62, -0.25, 0, 0.01, 0.37, 1]) {
      expect(scaleToSlider(sliderToScale(t))).toBeCloseTo(t);
    }
    for (const scale of [0.25, 0.5, 1, 1.5, 2, 4]) {
      expect(sliderToScale(scaleToSlider(scale))).toBeCloseTo(scale);
    }
  });

  it('pins scales outside the range, and nonsense, to the ends', () => {
    expect(scaleToSlider(0.1)).toBe(-1);
    expect(scaleToSlider(5)).toBe(1);
    expect(scaleToSlider(0)).toBe(-1);
    expect(sliderToScale(3)).toBeCloseTo(4);
  });

  it('reads out the scale with a multiplication sign', () => {
    expect(formatScale(1)).toBe('1.0×');
    expect(formatScale(2.5)).toBe('2.5×');
    expect(formatScale(0.25)).toBe('0.25×');
  });
});

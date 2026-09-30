import { describe, it, expect } from 'vitest';
import { MAP_SCALE_FADE_START, MAP_SCALE_HIDDEN, MAX_MAP_SCALE, resolveCalloutSizing } from './sizing';

const screen = { scale: 1.5, sizeMode: 'screen', referenceZoom: 12 } as const;
const map = { scale: 1, sizeMode: 'map', referenceZoom: 12 } as const;

describe('resolveCalloutSizing', () => {
  it('keeps the callout scale at every zoom in screen mode', () => {
    expect(resolveCalloutSizing(screen, 4)).toEqual({ scale: 1.5, placement: 1, fade: 1 });
    expect(resolveCalloutSizing(screen, 20)).toEqual({ scale: 1.5, placement: 1, fade: 1 });
  });

  it('is unscaled at the reference zoom, and when no view zoom is given', () => {
    expect(resolveCalloutSizing(map, 12)).toEqual({ scale: 1, placement: 1, fade: 1 });
    expect(resolveCalloutSizing(map)).toEqual({ scale: 1, placement: 1, fade: 1 });
  });

  it('doubles per zoom level in map mode, multiplied by the size', () => {
    expect(resolveCalloutSizing(map, 14)).toMatchObject({ scale: 4, placement: 4 });
    expect(resolveCalloutSizing({ ...map, scale: 2 }, 11)).toMatchObject({ scale: 1, placement: 0.5 });
  });

  it('clamps the effective scale at the maximum and keeps placement consistent with it', () => {
    const sizing = resolveCalloutSizing({ ...map, scale: 2 }, 20)!;
    expect(sizing.scale).toBe(MAX_MAP_SCALE);
    expect(sizing.placement).toBe(MAX_MAP_SCALE / 2);
  });

  it('is fully opaque down to the fade start, then fades linearly', () => {
    // Zoom 12 - log2(1 / scale) gives a scale of exactly `s` for a size of 1.
    const at = (s: number) => resolveCalloutSizing(map, 12 + Math.log2(s));
    expect(at(MAP_SCALE_FADE_START)!.fade).toBeCloseTo(1);
    expect(at((MAP_SCALE_FADE_START + MAP_SCALE_HIDDEN) / 2)!.fade).toBeCloseTo(0.5);
    expect(at(MAP_SCALE_HIDDEN * 1.01)!.fade).toBeCloseTo(0.01, 1);
  });

  it('is not drawn below the hidden threshold', () => {
    expect(resolveCalloutSizing(map, 12 + Math.log2(MAP_SCALE_HIDDEN * 0.99))).toBeNull();
    expect(resolveCalloutSizing(map, 0)).toBeNull();
  });
});

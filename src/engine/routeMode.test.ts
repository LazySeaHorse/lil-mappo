import { describe, it, expect } from 'vitest';
import { convertRouteCalculation } from './routeMode';
import type { RouteCalculation } from '@/store/types';

const vehicle = { enabled: true, type: 'dot' as const, modelId: '', scale: 1 };

describe('convertRouteCalculation', () => {
  it('returns the same calculation when the mode is unchanged', () => {
    const calc: RouteCalculation = { mode: 'car', startPoint: [1, 1], endPoint: [2, 2] };
    expect(convertRouteCalculation(calc, 'car')).toBe(calc);
  });

  it('turns placed endpoints into walk points and keeps the vehicle', () => {
    expect(convertRouteCalculation({ mode: 'car', startPoint: [1, 1], endPoint: [2, 2], vehicle }, 'walk'))
      .toEqual({ mode: 'walk', points: [[1, 1], [2, 2]], curved: true, sharpness: 0.85, vehicle });
    expect(convertRouteCalculation({ mode: 'flight', startPoint: [1, 1], endPoint: [0, 0] }, 'walk'))
      .toMatchObject({ points: [[1, 1]] });
    expect(convertRouteCalculation(undefined, 'walk')).toMatchObject({ points: [] });
  });

  it('turns the first and last walk points into endpoints', () => {
    const walk: RouteCalculation = { mode: 'walk', points: [[1, 1], [5, 5], [2, 2]], curved: true, sharpness: 0.85, vehicle };
    expect(convertRouteCalculation(walk, 'car')).toEqual({ mode: 'car', startPoint: [1, 1], endPoint: [2, 2], vehicle });
  });

  it('leaves the end unset when a walk has fewer than two points', () => {
    const lone: RouteCalculation = { mode: 'walk', points: [[1, 1]], curved: true, sharpness: 0.85 };
    expect(convertRouteCalculation(lone, 'flight')).toEqual({ mode: 'flight', startPoint: [1, 1], endPoint: [0, 0] });
    expect(convertRouteCalculation({ ...lone, points: [] }, 'car')).toEqual({ mode: 'car', startPoint: [0, 0], endPoint: [0, 0] });
  });
});

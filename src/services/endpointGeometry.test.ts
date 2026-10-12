import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeEndpointGeometry } from './endpointGeometry';
import { getDirections } from '@/services/directions';
import { calculateFlightArc } from '@/services/flightPath';

vi.mock('@/services/directions', () => ({ getDirections: vi.fn() }));

describe('computeEndpointGeometry', () => {
  beforeEach(() => {
    vi.mocked(getDirections).mockReset();
  });

  it('wraps the directions geometry for a car route and passes the signal through', async () => {
    const directions = { geometry: { type: 'LineString' as const, coordinates: [[0, 0], [1, 1]] }, distance: 10, duration: 5 };
    vi.mocked(getDirections).mockResolvedValue(directions);
    const signal = new AbortController().signal;

    const result = await computeEndpointGeometry('car', [0, 0], [1, 1], signal);

    expect(getDirections).toHaveBeenCalledWith([0, 0], [1, 1], signal);
    expect(result.directions).toBe(directions);
    expect(result.geojson).toEqual({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: directions.geometry, properties: {} }],
    });
  });

  it('draws a great-circle arc for a flight synchronously, without calling directions', () => {
    const result = computeEndpointGeometry('flight', [-0.45, 51.47], [-73.78, 40.64]);

    expect(result).not.toBeInstanceOf(Promise);
    if (result instanceof Promise) return;
    expect(getDirections).not.toHaveBeenCalled();
    expect(result.directions).toBeUndefined();
    expect(result.geojson.features[0].geometry).toEqual(calculateFlightArc([-0.45, 51.47], [-73.78, 40.64]));
  });

  it('rejects when directions fail', async () => {
    vi.mocked(getDirections).mockRejectedValue(new Error('No route found'));
    await expect(computeEndpointGeometry('car', [0, 0], [1, 1])).rejects.toMatchObject({ message: 'No route found' });
  });
});

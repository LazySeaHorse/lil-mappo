import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MapRef } from 'react-map-gl/mapbox';
import { MapRefContext } from '@/hooks/useMapRef';
import { searchBoundary } from '@/services/nominatim';
import { BoundarySearch } from './BoundarySearch';

vi.mock('@/services/nominatim', async (importActual) => ({
  ...(await importActual<typeof import('@/services/nominatim')>()),
  searchBoundary: vi.fn(async () => []),
}));

const map = {
  getCenter: () => ({ lng: -73.97, lat: 40.78 }),
  getBounds: () => ({ getWest: () => -74.1, getSouth: () => 40.7, getEast: () => -73.8, getNorth: () => 40.9 }),
};

describe('BoundarySearch', () => {
  it('leans towards the visible map', async () => {
    const ref = { current: { getMap: () => map } as unknown as MapRef };
    render(
      <MapRefContext.Provider value={ref}>
        <BoundarySearch initialValue="" onSelect={vi.fn()} />
      </MapRefContext.Provider>,
    );
    const input = screen.getByPlaceholderText('Search for a place or region');
    fireEvent.change(input, { target: { value: 'Central Park' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(searchBoundary).toHaveBeenCalled());
    expect(searchBoundary).toHaveBeenCalledWith('Central Park', expect.any(AbortSignal), [-74.1, 40.7, -73.8, 40.9]);
  });
});

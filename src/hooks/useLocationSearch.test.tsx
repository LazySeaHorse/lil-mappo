import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapRef } from 'react-map-gl/mapbox';
import { useProjectStore } from '@/store/useProjectStore';
import { MapRefContext } from '@/hooks/useMapRef';
import { useLocationSearch } from './useLocationSearch';

const { suggest, retrieve } = vi.hoisted(() => ({ suggest: vi.fn(), retrieve: vi.fn() }));

vi.mock('@mapbox/search-js-core', () => ({
  SearchBoxCore: class {},
  SearchSession: class {
    suggest = suggest;
    retrieve = retrieve;
  },
}));

const liveMap = {
  getCenter: () => ({ lng: -73.97, lat: 40.78 }),
  getBounds: () => ({ getWest: () => -74.1, getSouth: () => 40.7, getEast: () => -73.8, getNorth: () => 40.9 }),
};

function withMap(map: unknown) {
  const ref = { current: map ? ({ getMap: () => map } as unknown as MapRef) : null };
  return ({ children }: { children: ReactNode }) => (
    <MapRefContext.Provider value={ref}>{children}</MapRefContext.Provider>
  );
}

beforeEach(() => {
  suggest.mockReset();
  useProjectStore.setState({ mapCenter: [-112.07, 33.45] });
});

describe('useLocationSearch', () => {
  it('searches the visible map with the live center, not the stored one', async () => {
    suggest.mockResolvedValue({ suggestions: [{ mapbox_id: 'cp', name: 'Central Park' }] });
    const { result } = renderHook(() => useLocationSearch({ onSelect: vi.fn() }), { wrapper: withMap(liveMap) });

    await act(() => result.current.performSearch('Central Park'));

    expect(suggest).toHaveBeenCalledTimes(1);
    expect(suggest).toHaveBeenCalledWith('Central Park', {
      proximity: [-73.97, 40.78],
      bbox: [-74.1, 40.7, -73.8, 40.9],
    });
    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.isOpen).toBe(true);
  });

  it('retries without the bounds when the view has no match', async () => {
    suggest
      .mockResolvedValueOnce({ suggestions: [] })
      .mockResolvedValueOnce({ suggestions: [{ mapbox_id: 'p', name: 'Paris' }] });
    const { result } = renderHook(() => useLocationSearch({ onSelect: vi.fn() }), { wrapper: withMap(liveMap) });

    await act(() => result.current.performSearch('Paris'));

    expect(suggest).toHaveBeenCalledTimes(2);
    expect(suggest).toHaveBeenLastCalledWith('Paris', { proximity: [-73.97, 40.78] });
    expect(result.current.suggestions).toHaveLength(1);
  });

  it('falls back to the stored map center when no map is available', async () => {
    suggest.mockResolvedValue({ suggestions: [{ mapbox_id: 'a', name: 'A' }] });
    const { result } = renderHook(() => useLocationSearch({ onSelect: vi.fn() }));

    await act(() => result.current.performSearch('Phoenix'));

    expect(suggest).toHaveBeenCalledTimes(1);
    expect(suggest).toHaveBeenCalledWith('Phoenix', { proximity: [-112.07, 33.45] });
  });

  it('omits proximity when no map exists and the stored center is unset', async () => {
    useProjectStore.setState({ mapCenter: [0, 0] });
    suggest.mockResolvedValue({ suggestions: [] });
    const { result } = renderHook(() => useLocationSearch({ onSelect: vi.fn() }));

    await act(() => result.current.performSearch('Nowhere'));

    expect(suggest).toHaveBeenCalledWith('Nowhere', { proximity: undefined });
  });
});

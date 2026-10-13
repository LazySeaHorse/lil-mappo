import type { ChangeEvent, ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapRef } from 'react-map-gl/mapbox';
import { MapRefContext } from '@/hooks/useMapRef';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useToolbarActions } from './useToolbarActions';

vi.mock('react-secure-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() },
}));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: null }) }));
vi.mock('@/lib/analytics/reporters', () => ({ reportRouteAdded: vi.fn() }));
vi.mock('@/lib/lazyModules', () => ({
  loadFileImport: async () => ({
    importRouteFile: async () => ({
      name: 'Ride',
      geojson: {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[8, 46], [9, 47]] } }],
      },
    }),
  }),
}));

const fitBounds = vi.fn();
const map = {
  getContainer: () => ({ getBoundingClientRect: () => ({ width: 1200, height: 800 }) }),
  getZoom: () => 5,
  project: () => ({ x: 600, y: 400 }),
  fitBounds,
  easeTo: vi.fn(),
};
const wrapper = ({ children }: { children: ReactNode }) => (
  <MapRefContext.Provider value={{ current: { getMap: () => map } as unknown as MapRef }}>{children}</MapRefContext.Provider>
);

const fileEvent = () =>
  ({ target: { files: [new File(['x'], 'ride.gpx')], value: '' } }) as unknown as ChangeEvent<HTMLInputElement>;

describe('useToolbarActions handleImport', () => {
  beforeEach(() => {
    fitBounds.mockClear();
    useAuthStore.setState({ user: { id: 'u1' } as never });
    useProjectStore.setState({ items: {}, itemOrder: [], playheadTime: 0, isPlaying: false, isScrubbing: false, isExporting: false });
  });

  it('adds the imported route and shows it on the map', async () => {
    const { result } = renderHook(() => useToolbarActions(), { wrapper });
    await act(() => result.current.handleImport(fileEvent()));

    expect(Object.values(useProjectStore.getState().items).some((i) => i.kind === 'route')).toBe(true);
    expect(fitBounds).toHaveBeenCalledTimes(1);
    expect(fitBounds.mock.calls[0][0]).toEqual([[8, 46], [9, 47]]);
  });
});

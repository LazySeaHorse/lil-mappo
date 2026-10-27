import type { ChangeEvent, ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapRef } from 'react-map-gl/mapbox';
import { MapRefContext } from '@/hooks/useMapRef';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from 'sonner';
import { ITEM_TYPE_LABELS } from '@/lib/terms';
import { useToolbarActions } from './useToolbarActions';
import { CAMERA_TRACK_ID } from '@/store/projectDocument';
import type { CameraItem } from '@/store/types';

vi.mock('react-secure-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: null }) }));
vi.mock('@/lib/analytics/reporters', () => ({ reportRouteAdded: vi.fn() }));
vi.mock('@/services/fileImport', () => ({
  importRouteFile: async () => ({
    name: 'Ride',
    format: 'gpx',
    geojson: {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[8, 46], [9, 47]] } }],
    },
  }),
}));

const fitBounds = vi.fn();
const map = {
  getContainer: () => ({ clientWidth: 1200, clientHeight: 800, getBoundingClientRect: () => ({ width: 1200, height: 800 }) }),
  getZoom: () => 5,
  getCenter: () => ({ lng: 8.5, lat: 47.3 }),
  getPitch: () => 30,
  getBearing: () => 15,
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

describe('useToolbarActions pickRouteFile', () => {
  const requestSignIn = vi.fn();
  const input = () => ({ click: vi.fn() }) as unknown as HTMLInputElement;

  beforeEach(() => {
    requestSignIn.mockClear();
    useAuthStore.setState({ requestSignIn } as never);
  });

  it('asks a guest to sign in instead of opening the file picker', () => {
    useAuthStore.setState({ user: null });
    const { result } = renderHook(() => useToolbarActions(), { wrapper });
    const el = input();
    result.current.pickRouteFile(el);
    expect(requestSignIn).toHaveBeenCalledWith('Sign in to import a route.');
    expect(el.click).not.toHaveBeenCalled();
  });

  it('opens the file picker for a signed-in user', () => {
    useAuthStore.setState({ user: { id: 'u1' } as never });
    const { result } = renderHook(() => useToolbarActions(), { wrapper });
    const el = input();
    result.current.pickRouteFile(el);
    expect(el.click).toHaveBeenCalledTimes(1);
    expect(requestSignIn).not.toHaveBeenCalled();
  });
});


describe('useToolbarActions handleAddCameraKF', () => {
  beforeEach(() => {
    const camera: CameraItem = { id: CAMERA_TRACK_ID, kind: 'camera', keyframes: [] };
    useProjectStore.setState({
      items: { [CAMERA_TRACK_ID]: camera },
      itemOrder: [CAMERA_TRACK_ID],
      isPlaying: false,
      playheadTime: 3,
      isInspectorOpen: false,
      selectedItemId: null,
      selectedKeyframeId: null,
    });
  });

  const keyframes = () => (useProjectStore.getState().items[CAMERA_TRACK_ID] as CameraItem).keyframes;

  it('adds a camera view that shows the live map camera', () => {
    const { result } = renderHook(() => useToolbarActions(), { wrapper });
    act(() => result.current.handleAddCameraKF());
    const added = keyframes().find((k) => k.time === 3);
    expect(added?.camera).toMatchObject({ center: [8.5, 47.3], zoom: 5, pitch: 30, bearing: 15 });
  });

  it('selects the new camera view and opens the inspector on it', () => {
    const { result } = renderHook(() => useToolbarActions(), { wrapper });
    act(() => result.current.handleAddCameraKF());
    const added = keyframes().find((k) => k.time === 3)!;
    const s = useProjectStore.getState();
    expect(s.selectedItemId).toBe(CAMERA_TRACK_ID);
    expect(s.selectedKeyframeId).toBe(added.id);
    expect(s.isInspectorOpen).toBe(true);
  });

  it('says "camera view" in the toast', () => {
    const { result } = renderHook(() => useToolbarActions(), { wrapper });
    act(() => result.current.handleAddCameraKF());
    expect(toast.success).toHaveBeenCalledWith(`${ITEM_TYPE_LABELS['camera-kf']} added at 3.0s`);
  });
});

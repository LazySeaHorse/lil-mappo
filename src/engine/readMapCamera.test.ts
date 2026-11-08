import { beforeEach, describe, expect, it } from 'vitest';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useProjectStore } from '@/store/useProjectStore';
import { DEFAULT_MAP_CAMERA, readMapCamera } from './readMapCamera';

const fakeMap = (v: { lng: number; lat: number; zoom: number; pitch: number; bearing: number }, width = 1920) =>
  ({
    getCenter: () => ({ lng: v.lng, lat: v.lat }),
    getZoom: () => v.zoom,
    getPitch: () => v.pitch,
    getBearing: () => v.bearing,
    getContainer: () => ({ clientWidth: width }),
  }) as unknown as MapboxMap;

beforeEach(() => useProjectStore.setState({ frameWidth: 1920 }));

describe('readMapCamera', () => {
  it('reads center, zoom, pitch and bearing from the map', () => {
    const map = fakeMap({ lng: 8.5, lat: 47.3, zoom: 11.25, pitch: 45, bearing: -30 });
    expect(readMapCamera(map)).toEqual({ center: [8.5, 47.3], zoom: 11.25, pitch: 45, bearing: -30 });
  });

  it('reads the zoom as the project frame measures it, on a map of another width', () => {
    const view = { lng: 8.5, lat: 47.3, zoom: 11, pitch: 0, bearing: 0 };
    // A map half the frame's width shows the frame's view one zoom level further out.
    expect(readMapCamera(fakeMap(view, 960)).zoom).toBe(12);
  });

  it('returns a world view when there is no map', () => {
    expect(readMapCamera(undefined)).toEqual(DEFAULT_MAP_CAMERA);
    expect(readMapCamera(null)).toEqual(DEFAULT_MAP_CAMERA);
  });

  it('returns a fresh center array each time', () => {
    expect(readMapCamera(null).center).not.toBe(DEFAULT_MAP_CAMERA.center);
  });
});

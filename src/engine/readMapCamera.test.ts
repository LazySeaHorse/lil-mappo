import { afterEach, describe, expect, it } from 'vitest';
import type { Map as MapboxMap } from 'mapbox-gl';
import { DEFAULT_MAP_CAMERA, readMapCamera } from './readMapCamera';
import { NO_FIT_VIEW, setViewFit } from './viewOffset';

const fakeMap = (v: { lng: number; lat: number; zoom: number; pitch: number; bearing: number }) =>
  ({
    getCenter: () => ({ lng: v.lng, lat: v.lat }),
    getZoom: () => v.zoom,
    getPitch: () => v.pitch,
    getBearing: () => v.bearing,
  }) as unknown as MapboxMap;

describe('readMapCamera', () => {
  afterEach(() => setViewFit(NO_FIT_VIEW));

  it('reads center, zoom, pitch and bearing from the map', () => {
    const map = fakeMap({ lng: 8.5, lat: 47.3, zoom: 11.25, pitch: 45, bearing: -30 });
    expect(readMapCamera(map)).toEqual({ center: [8.5, 47.3], zoom: 11.25, pitch: 45, bearing: -30 });
  });

  it('takes fit mode\'s zoom-out off, so a saved view is the full-screen one', () => {
    setViewFit({ offset: -1, padding: NO_FIT_VIEW.padding });
    const map = fakeMap({ lng: 8.5, lat: 47.3, zoom: 10, pitch: 45, bearing: -30 });
    expect(readMapCamera(map)).toEqual({ center: [8.5, 47.3], zoom: 11, pitch: 45, bearing: -30 });
  });

  it('returns a world view when there is no map', () => {
    expect(readMapCamera(undefined)).toEqual(DEFAULT_MAP_CAMERA);
    expect(readMapCamera(null)).toEqual(DEFAULT_MAP_CAMERA);
  });

  it('returns a fresh center array each time', () => {
    expect(readMapCamera(null).center).not.toBe(DEFAULT_MAP_CAMERA.center);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type mapboxgl from 'mapbox-gl';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import { createProject } from '@/store/projectDocument';
import type { CameraItem, CameraKeyframe } from '@/store/types';
import { applyCamera, hasMapCenter, syncMapToProject } from './cameraUtils';

const keyframe = (time: number, zoom: number): CameraKeyframe => ({
  id: `kf-${time}`,
  time,
  camera: { center: [10, 20], zoom, pitch: 0, bearing: 0, altitude: null },
  easing: 'linear',
  followRoute: null,
});

function setKeyframes(keyframes: CameraKeyframe[]) {
  const camera: CameraItem = { kind: 'camera', id: CAMERA_TRACK_ID, keyframes };
  useProjectStore.setState((s) => ({ items: { ...s.items, [CAMERA_TRACK_ID]: camera } }));
}

describe('syncMapToProject', () => {
  const map = { jumpTo: vi.fn() };

  beforeEach(() => {
    map.jumpTo.mockClear();
    useProjectStore.getState().loadFullProject(createProject());
    useProjectStore.setState({ isCameraEnabled: true, mapCenter: [0, 0] });
  });

  it('applies the camera track at the given time', () => {
    setKeyframes([keyframe(0, 4), keyframe(10, 8)]);
    syncMapToProject(map as unknown as mapboxgl.Map, 5);
    expect(map.jumpTo).toHaveBeenCalledWith(expect.objectContaining({ center: [10, 20], zoom: 6 }));
  });

  it('falls back to the saved map centre without keyframes', () => {
    useProjectStore.setState({ mapCenter: [3, 4] });
    syncMapToProject(map as unknown as mapboxgl.Map, 5);
    expect(map.jumpTo).toHaveBeenCalledWith({ center: [3, 4] });
  });

  it('leaves the map alone with no keyframes and no saved centre', () => {
    syncMapToProject(map as unknown as mapboxgl.Map, 5);
    expect(map.jumpTo).not.toHaveBeenCalled();
  });

  it('does nothing while the camera is disabled', () => {
    setKeyframes([keyframe(0, 4)]);
    useProjectStore.setState({ isCameraEnabled: false });
    syncMapToProject(map as unknown as mapboxgl.Map, 5);
    expect(map.jumpTo).not.toHaveBeenCalled();
  });
});

describe('applyCamera over terrain', () => {
  const map = () => ({
    queryTerrainElevation: vi.fn(() => 777),
    setFreeCameraOptions: vi.fn(),
    jumpTo: vi.fn(),
    transform: { height: 800 },
  });
  const altitude = (m: ReturnType<typeof map>) => m.setFreeCameraOptions.mock.calls[0][0].position.toAltitude();
  const shot = { type: 'freeCam' as const, position: [8, 46, 1000] as [number, number, number], lookAt: [8.01, 46] as [number, number] };

  it('measures a planned shot from its planned ground, not the terrain under it this frame', () => {
    const m = map();
    applyCamera(m as unknown as mapboxgl.Map, { ...shot, ground: 200 });
    expect(altitude(m)).toBeCloseTo(1200, 0);
  });

  it('reads the terrain under an unplanned shot', () => {
    const m = map();
    applyCamera(m as unknown as mapboxgl.Map, shot);
    expect(altitude(m)).toBeCloseTo(1777, 0);
  });

  it('blends a planned shot with the terrain under a keyframe', () => {
    const keyframe = { type: 'jumpTo' as const, center: [8.01, 46] as [number, number], zoom: 12, pitch: 40, bearing: 0 };
    const atKeyframe = map();
    applyCamera(atKeyframe as unknown as mapboxgl.Map, { type: 'blend', from: keyframe, to: { ...shot, ground: 200 }, t: 0 });
    const plain = map();
    applyCamera(plain as unknown as mapboxgl.Map, { type: 'blend', from: keyframe, to: shot, t: 0 });
    // At the keyframe end the planned ground has no say: it starts where the keyframe is.
    expect(altitude(atKeyframe)).toBeCloseTo(altitude(plain), 3);
  });
});

describe('applyCamera at globe zooms', () => {
  const map = () => ({
    queryTerrainElevation: vi.fn(() => 0),
    setFreeCameraOptions: vi.fn(),
    jumpTo: vi.fn(),
    transform: { height: 800 },
  });
  const keyframe = { type: 'jumpTo' as const, center: [-96.8, 37.8] as [number, number], zoom: 3.1, pitch: 20, bearing: 10 };
  const shot = { type: 'freeCam' as const, position: [-111.9, 40.5, 20000] as [number, number, number], lookAt: [-111.9, 40.7] as [number, number] };

  // Below Mapbox's globe-to-flat switch a free camera lands elsewhere than jumpTo would.
  it('moves off a zoomed-out keyframe toward a shot the way the keyframe itself is shown', () => {
    const m = map();
    applyCamera(m as unknown as mapboxgl.Map, { type: 'blend', from: keyframe, to: shot, t: 0.001 });
    expect(m.setFreeCameraOptions).not.toHaveBeenCalled();
    const [{ center, zoom, pitch, bearing }] = m.jumpTo.mock.calls[0];
    expect(center[0]).toBeCloseTo(-96.8, 3);
    expect(center[1]).toBeCloseTo(37.8, 3);
    expect(zoom).toBeCloseTo(3.1, 3);
    expect(pitch).toBeCloseTo(20, 2);
    expect(bearing).toBeCloseTo(10, 2);
  });

  it('arrives at a zoomed-out keyframe the way the keyframe itself is shown', () => {
    const m = map();
    applyCamera(m as unknown as mapboxgl.Map, { type: 'blend', from: shot, to: keyframe, t: 0.999 });
    expect(m.setFreeCameraOptions).not.toHaveBeenCalled();
    expect(m.jumpTo.mock.calls[0][0].zoom).toBeCloseTo(3.1, 3);
  });

  it('shows a far-off shot the way the blend into it ends', () => {
    const far = { type: 'freeCam' as const, position: [-111.9, 39.5, 400000] as [number, number, number], lookAt: [-111.9, 40.7] as [number, number] };
    const plain = map();
    applyCamera(plain as unknown as mapboxgl.Map, far);
    const blended = map();
    applyCamera(blended as unknown as mapboxgl.Map, { type: 'blend', from: keyframe, to: far, t: 1 });
    expect(plain.setFreeCameraOptions).not.toHaveBeenCalled();
    expect(plain.jumpTo.mock.calls[0][0]).toEqual(blended.jumpTo.mock.calls[0][0]);
  });

  it('still flies the close-in part of the move as a free camera', () => {
    const m = map();
    applyCamera(m as unknown as mapboxgl.Map, { type: 'blend', from: keyframe, to: shot, t: 0.999 });
    expect(m.setFreeCameraOptions).toHaveBeenCalled();
    expect(m.jumpTo).not.toHaveBeenCalled();
  });
});

describe('hasMapCenter', () => {
  it('treats a missing centre and [0, 0] as never set', () => {
    expect(hasMapCenter(undefined)).toBe(false);
    expect(hasMapCenter([0, 0])).toBe(false);
    expect(hasMapCenter([0, 1])).toBe(true);
    expect(hasMapCenter([-73.97, 0])).toBe(true);
  });
});

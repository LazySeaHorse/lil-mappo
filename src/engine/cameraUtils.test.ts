import { beforeEach, describe, expect, it, vi } from 'vitest';
import type mapboxgl from 'mapbox-gl';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import { createProject } from '@/store/projectDocument';
import type { CameraItem, CameraKeyframe } from '@/store/types';
import { syncMapToProject } from './cameraUtils';

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

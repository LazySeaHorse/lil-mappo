import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const syncMapToProject = vi.hoisted(() => vi.fn());
const demListeners = vi.hoisted(() => new Set<() => void>());
vi.mock('@/engine/cameraUtils', () => ({
  syncMapToProject,
  loadProjectTerrain: vi.fn(async () => {}),
}));
vi.mock('@/services/terrainDem', () => ({
  onDemLoaded: (listener: () => void) => {
    demListeners.add(listener);
    return () => demListeners.delete(listener);
  },
}));

import { useProjectStore } from '@/store/useProjectStore';
import { usePlayback } from './usePlayback';

const map = { id: 'map' };
const mapRef = { current: { getMap: () => map } } as never;

describe('usePlayback camera driving', () => {
  beforeEach(() => {
    useProjectStore.setState({ isPlaying: false, isExporting: false, isCapturingViewport: false, playheadTime: 0 });
    syncMapToProject.mockClear();
  });

  afterEach(() => {
    demListeners.clear();
  });

  it('drives the camera when the paused playhead moves', () => {
    const { unmount } = renderHook(() => usePlayback(mapRef));
    useProjectStore.getState().setPlayheadTime(2);
    expect(syncMapToProject).toHaveBeenCalledWith(map, 2);
    unmount();
  });

  it('leaves the camera to the export while exporting, then re-drives it once', () => {
    const { unmount } = renderHook(() => usePlayback(mapRef));
    useProjectStore.setState({ isExporting: true });
    useProjectStore.setState({ isCapturingViewport: true });
    useProjectStore.getState().setPlayheadTime(1);
    useProjectStore.getState().setPlayheadTime(2);
    useProjectStore.getState().setPlayheadTime(0.5);
    useProjectStore.setState({ isCapturingViewport: false });
    expect(syncMapToProject).not.toHaveBeenCalled();

    useProjectStore.setState({ isExporting: false });
    expect(syncMapToProject).toHaveBeenCalledTimes(1);
    expect(syncMapToProject).toHaveBeenCalledWith(map, 0.5);
    unmount();
  });

  it('leaves the camera to a viewport capture (snapshot, agent frames)', () => {
    const { unmount } = renderHook(() => usePlayback(mapRef));
    useProjectStore.setState({ isCapturingViewport: true });
    useProjectStore.getState().setPlayheadTime(3);
    demListeners.forEach((listener) => listener());
    expect(syncMapToProject).not.toHaveBeenCalled();

    useProjectStore.setState({ isCapturingViewport: false });
    expect(syncMapToProject).toHaveBeenCalledTimes(1);
    expect(syncMapToProject).toHaveBeenCalledWith(map, 3);
    unmount();
  });

  it('does not move the restored camera after a capture that never touched the playhead', () => {
    const { unmount } = renderHook(() => usePlayback(mapRef));
    useProjectStore.setState({ isCapturingViewport: true });
    useProjectStore.setState({ isCapturingViewport: false });
    expect(syncMapToProject).not.toHaveBeenCalled();
    unmount();
  });
});

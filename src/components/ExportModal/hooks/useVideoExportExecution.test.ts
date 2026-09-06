import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MapSceneRuntimeRef } from '@/hooks/useMapRuntime';
import { useProjectStore } from '@/store/useProjectStore';
import type { ExportPlan } from '../exportPlan';
import { runExport } from '@/services/videoExport';
import { useVideoExportExecution } from './useVideoExportExecution';

vi.mock('@/services/videoExport', () => ({ runExport: vi.fn() }));
vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

const exportPlan: ExportPlan = {
  renderConfig: {
    resolution: [1280, 720],
    fps: 30,
    aspectRatio: '16:9',
    exportResolution: '720p',
    isVertical: false,
    mapStyle: 'standard',
    terrainEnabled: false,
    buildingsEnabled: false,
    labelVisibility: {},
    show3dLandmarks: false,
    show3dTrees: false,
    show3dFacades: false,
  },
  startTime: 0,
  endTime: 5,
};

const runtimeRef = { current: null } as MapSceneRuntimeRef;
const mockedRunExport = vi.mocked(runExport);

afterEach(() => {
  mockedRunExport.mockReset();
  useProjectStore.setState({ isExporting: false, isPlaying: false, hideUI: false });
});

describe('useVideoExportExecution', () => {
  it('pauses during export and restores the previous workflow state', async () => {
    useProjectStore.setState({ isPlaying: true, hideUI: true });
    let finishExport!: (blob: Blob) => void;
    mockedRunExport.mockReturnValue(new Promise((resolve) => {
      finishExport = resolve;
    }));
    const { result } = renderHook(() => (
      useVideoExportExecution(runtimeRef, exportPlan, false, 'Project')
    ));

    let exporting!: Promise<void>;
    act(() => {
      exporting = result.current.startExport();
    });

    expect(useProjectStore.getState()).toMatchObject({
      isExporting: true,
      isPlaying: false,
      hideUI: true,
    });

    await act(async () => {
      finishExport(new Blob());
      await exporting;
    });

    expect(useProjectStore.getState()).toMatchObject({
      isExporting: false,
      isPlaying: true,
      hideUI: true,
    });
  });

  it('restores workflow state when export fails', async () => {
    useProjectStore.setState({ isPlaying: true, hideUI: true });
    mockedRunExport.mockRejectedValue(new Error('encoder failed'));
    const { result } = renderHook(() => (
      useVideoExportExecution(runtimeRef, exportPlan, false, 'Project')
    ));

    await act(async () => {
      await result.current.startExport();
    });

    expect(result.current.error).toBe('encoder failed');
    expect(useProjectStore.getState()).toMatchObject({
      isExporting: false,
      isPlaying: true,
      hideUI: true,
    });
  });
});

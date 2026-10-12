import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MapSceneRuntimeRef } from '@/hooks/useMapRuntime';
import { useProjectStore } from '@/store/useProjectStore';
import type { ExportPlan } from '../exportPlan';
import { runExport } from '@/services/videoExport';
import { setPersonProps, track } from '@/lib/analytics';
import { useVideoExportExecution } from './useVideoExportExecution';

vi.mock('@/services/videoExport', () => ({ runExport: vi.fn() }));
vi.mock('file-saver', () => ({ saveAs: vi.fn() }));
vi.mock('@/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/analytics')>()),
  track: vi.fn(),
  setPersonProps: vi.fn(),
}));

const exportPlan: ExportPlan = {
  renderConfig: {
    resolution: [1280, 720],
    fps: 30,
    aspectRatio: '16:9',
    exportResolution: '720p',
    isVertical: false,
  },
  startTime: 0,
  endTime: 5,
};

const runtimeRef = { current: null } as MapSceneRuntimeRef;
const mockedRunExport = vi.mocked(runExport);

afterEach(() => {
  mockedRunExport.mockReset();
  vi.mocked(track).mockClear();
  vi.mocked(setPersonProps).mockClear();
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
      useVideoExportExecution(runtimeRef, exportPlan, 'paid', 'Project')
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
      useVideoExportExecution(runtimeRef, exportPlan, 'paid', 'Project')
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

  describe('analytics', () => {
    const props = { resolution: '720p', fps: 30, duration_bucket: '<10s' };

    it('reports started and succeeded with coarse settings, and marks has_exported', async () => {
      mockedRunExport.mockResolvedValue(new Blob());
      const { result } = renderHook(() => useVideoExportExecution(runtimeRef, exportPlan, 'paid', 'My secret trip'));
      await act(async () => { await result.current.startExport(); });
      expect(track).toHaveBeenNthCalledWith(1, 'export_started', props);
      expect(track).toHaveBeenNthCalledWith(2, 'export_succeeded', props);
      expect(setPersonProps).toHaveBeenCalledWith({ has_exported: true });
      expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toContain('secret');
    });

    it('reports failures by error class only, never the raw message', async () => {
      mockedRunExport.mockRejectedValue(new Error('VideoEncoder error: bad config for /home/me/file.mp4'));
      const { result } = renderHook(() => useVideoExportExecution(runtimeRef, exportPlan, 'paid', 'Project'));
      await act(async () => { await result.current.startExport(); });
      expect(track).toHaveBeenLastCalledWith('export_failed', { ...props, error_class: 'encoder' });
      expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toContain('/home/me');
    });

    it('reports cancellation instead of failure when aborted', async () => {
      mockedRunExport.mockImplementation((_runtime, options) => new Promise((_resolve, reject) => {
        options.abortSignal.addEventListener('abort', () => reject(new DOMException('Export cancelled', 'AbortError')));
      }));
      const { result } = renderHook(() => useVideoExportExecution(runtimeRef, exportPlan, 'paid', 'Project'));
      let exporting!: Promise<void>;
      act(() => { exporting = result.current.startExport(); });
      await act(async () => { result.current.cancelExport(); await exporting; });
      expect(track).toHaveBeenLastCalledWith('export_cancelled', props);
      expect(track).not.toHaveBeenCalledWith('export_failed', expect.anything());
    });
  });
});

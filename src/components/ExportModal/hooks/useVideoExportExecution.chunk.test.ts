import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MapSceneRuntimeRef } from '@/hooks/useMapRuntime';
import type { ExportPlan } from '../exportPlan';
import { useVideoExportExecution } from './useVideoExportExecution';

vi.mock('@/lib/lazyModules', () => ({
  loadVideoExport: () =>
    Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/videoExport-1.js')),
}));
vi.mock('file-saver', () => ({ saveAs: vi.fn() }));
vi.mock('@/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/analytics')>()),
  track: vi.fn(),
  setPersonProps: vi.fn(),
}));

const exportPlan: ExportPlan = {
  renderConfig: { resolution: [1280, 720], fps: 30, aspectRatio: '16:9', exportResolution: '720p', isVertical: false },
  startTime: 0,
  endTime: 5,
};

describe('useVideoExportExecution when the export chunk cannot load', () => {
  it('asks the user to reload instead of showing the raw browser error', async () => {
    const { result } = renderHook(() =>
      useVideoExportExecution({ current: null } as MapSceneRuntimeRef, exportPlan, 'paid', 'Project'),
    );

    await act(async () => {
      await result.current.startExport();
    });

    expect(result.current.error).toMatch(/reload/i);
    expect(result.current.error).not.toMatch(/dynamically imported/i);
  });
});

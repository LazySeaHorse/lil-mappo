import { useState, useRef } from 'react';
import { saveAs } from 'file-saver';
import { runExport } from '@/services/videoExport';
import { useProjectStore } from '@/store/useProjectStore';
import type { ExportPlan } from '../exportPlan';
import type { MapSceneRuntimeRef } from '@/hooks/useMapRuntime';

function getErrorMessage(error: unknown, fallback = 'Export failed'): string {
  return error instanceof Error ? error.message : fallback;
}

export function useVideoExportExecution(
  runtimeRef: MapSceneRuntimeRef,
  exportPlan: ExportPlan,
  showWatermark: boolean,
  projectName: string,
  onRequireAuth?: () => void,
  isLimitedGuest?: boolean
) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'prewarm' | 'capture'>('capture');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const startExport = async () => {
    if (isLimitedGuest && onRequireAuth) {
      onRequireAuth();
      return;
    }

    const initialPlaybackState = useProjectStore.getState().isPlaying;
    useProjectStore.getState().setIsExporting(true);
    setProgress(0);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;

    useProjectStore.getState().setIsPlaying(false);

    try {
      const blob = await runExport(runtimeRef, {
        ...exportPlan,
        showWatermark,
        onProgress: (pct, p) => {
          setProgress(pct);
          setPhase(p);
        },
        abortSignal: controller.signal,
      });

      const sanitizedName = projectName.replace(/[^a-zA-Z0-9 -]/g, '').trim() || 'export';
      const fileName = `${sanitizedName}.mp4`;
      saveAs(blob, fileName);
      setProgress(100);
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        setProgress(0);
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      abortRef.current = null;
      useProjectStore.getState().setIsExporting(false);
      useProjectStore.getState().setIsPlaying(initialPlaybackState);
    }
  };

  const cancelExport = () => {
    abortRef.current?.abort();
  };

  const clearError = () => {
    setError(null);
  };

  return {
    progress,
    phase,
    error,
    clearError,
    startExport,
    cancelExport,
  };
}

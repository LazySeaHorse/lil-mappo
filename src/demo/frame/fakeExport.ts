import type { MapSceneRuntimeRef } from '@/hooks/useMapRuntime';
import type { ExportOptions, ExportResult } from '@/services/videoExport';
import { isDemoAborted } from './clock';

/**
 * The demo frame's stand-in for `runExport` (see `useVideoExportExecution`,
 * which loads this instead of the encoder in the frame). The export modal runs
 * its real flow around it: the Export button becomes the progress bar, which
 * this fills, and the modal ends in its done state. Nothing is rendered or
 * encoded, and the hook skips the download.
 */

/** How long the bar takes to fill, in the run's clock ms. */
export const FAKE_EXPORT_MS = 4500;

/** Plays `frame(t)` for t from 0 to 1 over `ms`: the run's clock, so speed, pause and reset apply. */
export type FakeExportPace = (ms: number, frame: (t: number) => void) => Promise<void>;

let pace: FakeExportPace | null = null;

/** The export runner sets the run's clock here for the length of its step. */
export function setFakeExportPace(next: FakeExportPace | null): void {
  pace = next;
}

/** Without a run (the frame opened by hand), the bar fills in real time. */
const realTimePace: FakeExportPace = async (ms, frame) => {
  const start = performance.now();
  for (let t = 0; t < 1; ) {
    t = Math.min(1, (performance.now() - start) / ms);
    frame(t);
    if (t < 1) await new Promise((resolve) => setTimeout(resolve, 16));
  }
};

export async function runExport(_runtimeRef: MapSceneRuntimeRef, { onProgress, abortSignal }: ExportOptions): Promise<ExportResult> {
  const stopped = () => new DOMException('Export cancelled', 'AbortError');
  if (abortSignal.aborted) throw stopped();
  try {
    await (pace ?? realTimePace)(FAKE_EXPORT_MS, (t) => {
      if (abortSignal.aborted) throw stopped();
      onProgress(Math.round(t * 100), 'capture');
    });
  } catch (error) {
    // A reset ends the run mid-export: press the bar's own Cancel, so the modal is left cancelled, not failed.
    if (isDemoAborted(error)) document.querySelector<HTMLButtonElement>('button[aria-label="Cancel export"]')?.click();
    throw error;
  }
  return { blob: new Blob([], { type: 'video/mp4' }), incompleteFrames: 0 };
}

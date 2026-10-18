import type { MappoMood } from '@/components/Mappo/moods';
import type { LocalExportCapability } from '@/services/localExportCapability';

/** Why local export may not work in this browser, for the warning on the Export button. Null when it should. */
export function localExportWarning(
  capability: LocalExportCapability | null,
  width: number,
  height: number,
  fps: number,
): string | null {
  if (capability?.status === 'unsupported') {
    return "This browser can't make MP4 files, so local export is off. Use a current desktop version of Chrome or Edge.";
  }
  if (capability?.status === 'limited') {
    return `This browser says it can't encode H.264 video at ${width} × ${height}, ${fps} FPS, so the export may fail. Try a lower resolution or 30 FPS.`;
  }
  return null;
}

interface HeadlineState {
  isExporting: boolean;
  done: boolean;
  error?: string | null;
}

/**
 * The line under the popup's title. It changes in place (keep the tab open, complete, what went wrong), so the
 * popup keeps its height.
 */
export function exportHeadline({ isExporting, done, error }: HeadlineState): string {
  if (isExporting) return 'Keep this tab open and in front until the export finishes.';
  if (error) return error;
  if (done) return 'Export complete. The browser downloaded the file.';
  return 'Set the video format and export range.';
}

interface ExportMoodState {
  isExporting: boolean;
  done: boolean;
  failed: boolean;
  unsupported: boolean;
}

export function exportMood({ isExporting, done, failed, unsupported }: ExportMoodState): MappoMood {
  if (isExporting) return 'reel';
  if (failed || unsupported) return 'tangled';
  if (done) return 'cheer';
  return 'camera';
}

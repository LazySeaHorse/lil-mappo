import type { MappoMood } from '@/components/Mappo/moods';
import type { LocalExportCapability } from '@/services/localExportCapability';
import { RESOLUTION_LABELS, type ExportResolution } from '@/types/render';
import type { WandererNeed } from './exportPlan';

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

/** What the picked Pro settings are, for the line under the title and the Get Wanderer button. Null when none. */
export function wandererReason(needs: WandererNeed[], resolution: ExportResolution, maxDuration: number): string | null {
  if (needs.length === 0) return null;
  const names = needs.map((need) =>
    need === 'resolution' ? RESOLUTION_LABELS[resolution] : need === 'fps' ? '60 FPS' : `exports past ${maxDuration} seconds`,
  );
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const plural = names.length > 1 || needs[0] === 'duration';
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} ${plural ? 'come' : 'comes'} with the Wanderer plan.`;
}

interface HeadlineState {
  isExporting: boolean;
  done: boolean;
  error?: string | null;
  /** From `wandererReason`, when a Pro setting is picked. */
  wanderer?: string | null;
}

/**
 * The line under the popup's title. It changes in place (keep the tab open, complete, what went wrong), so the
 * popup keeps its height.
 */
export function exportHeadline({ isExporting, done, error, wanderer }: HeadlineState): string {
  if (isExporting) return 'Keep this tab open and in front until the export finishes.';
  if (error) return error;
  if (wanderer) return wanderer;
  if (done) return 'Export complete. The browser downloaded the file.';
  return 'Set the video format and export range.';
}

interface ExportMoodState {
  isExporting: boolean;
  done: boolean;
  failed: boolean;
  unsupported: boolean;
  needsWanderer?: boolean;
}

export function exportMood({ isExporting, done, failed, unsupported, needsWanderer }: ExportMoodState): MappoMood {
  if (isExporting) return 'reel';
  if (failed || unsupported) return 'tangled';
  if (needsWanderer) return 'key';
  if (done) return 'cheer';
  return 'camera';
}

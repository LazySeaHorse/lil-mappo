import type { ExportLimits } from '@/lib/cloudAccess';
import {
  getExportDimensions,
  type ExportResolution,
  type RenderConfig,
} from '@/types/render';

const RESOLUTION_ORDER: ExportResolution[] = [
  '480p',
  '720p',
  '1080p',
  '1440p',
  '2160p',
];

export interface ExportPlan {
  renderConfig: RenderConfig;
  startTime: number;
  endTime: number;
}

/**
 * Resolves user-selected settings against the limits in effect for this export.
 * The returned snapshot is shared by the UI preview and the export engine.
 */
export function resolveExportPlan(
  renderConfig: RenderConfig,
  range: { startTime: number; endTime: number },
  limits: ExportLimits,
): ExportPlan {
  const exportResolution =
    RESOLUTION_ORDER.indexOf(renderConfig.exportResolution) >
    RESOLUTION_ORDER.indexOf(limits.maxResolution)
      ? limits.maxResolution
      : renderConfig.exportResolution;
  const fps = Math.min(renderConfig.fps, limits.maxFps) as 30 | 60;

  return {
    renderConfig: {
      ...renderConfig,
      exportResolution,
      fps,
      resolution: getExportDimensions(
        exportResolution,
        renderConfig.aspectRatio,
        renderConfig.isVertical,
      ),
    },
    startTime: range.startTime,
    endTime: Math.min(range.endTime, limits.maxDuration),
  };
}

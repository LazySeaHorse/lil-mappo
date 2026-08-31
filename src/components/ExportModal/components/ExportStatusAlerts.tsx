import React from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Download, Cloud } from 'lucide-react';
import type { LocalExportCapability } from '@/services/videoExport';
import type { ExportLimits } from '@/lib/cloudAccess';

interface ExportStatusAlertsProps {
  limits: ExportLimits;
  isExporting: boolean;
  exportDuration: number;
  effectiveWidth: number;
  effectiveHeight: number;
  effectiveFps: number;
  totalFrames: number;
  localExportCapability: LocalExportCapability | null;
  phase: 'prewarm' | 'capture';
  progress: number;
  error: string | null;
  cloudSubmitted: boolean;
  onOpenUpgrade: () => void;
}

export function ExportStatusAlerts({
  limits,
  isExporting,
  exportDuration,
  effectiveWidth,
  effectiveHeight,
  effectiveFps,
  totalFrames,
  localExportCapability,
  phase,
  progress,
  error,
  cloudSubmitted,
  onOpenUpgrade,
}: ExportStatusAlertsProps) {
  return (
    <div className="space-y-4">
      {/* Plan limit / Keep open warning */}
      {(limits.limited || isExporting) && (
        <div
          className={`p-3 rounded-xl border space-y-2 ${
            isExporting
              ? 'bg-destructive/10 border-destructive/20'
              : 'bg-primary/5 border-primary/10'
          }`}
        >
          {isExporting ? (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-destructive flex items-center gap-1.5">
                <AlertTriangle size={12} />
                Keep this tab open
              </p>
              <p className="text-[11px] leading-relaxed text-destructive/80">
                Keep this tab active during export. Do not minimize the browser.
              </p>
            </div>
          ) : (
            <>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                <span className="font-medium text-primary">Free plan limit:</span> 720p, 30 FPS, and 30 seconds.
              </p>
              <button
                onClick={onOpenUpgrade}
                className="text-[10px] font-medium text-primary hover:underline flex items-center gap-1"
              >
                Use a paid plan or your own Mapbox token for higher limits <ArrowRight size={10} />
              </button>
            </>
          )}
        </div>
      )}

      {/* Info row */}
      <div className="flex gap-4 text-xs text-muted-foreground bg-secondary/50 rounded-xl p-3">
        <div>
          <span className="block font-medium text-foreground">{exportDuration.toFixed(1)}s</span>
          Duration
        </div>
        <div>
          <span className="block font-medium text-foreground whitespace-nowrap">
            {effectiveWidth} × {effectiveHeight}
          </span>
          Dimensions
        </div>
        <div>
          <span className="block font-medium text-foreground">{totalFrames}</span>
          Total frames
        </div>
        <div>
          <span className="block font-medium text-foreground">MP4</span>
          Format
        </div>
      </div>

      {/* Local export capability */}
      {localExportCapability?.status === 'ready' && (
        <div className="flex items-start gap-2 text-xs text-primary bg-primary/10 rounded-xl p-3">
          <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
          <span>
            Local export is available at {effectiveWidth} × {effectiveHeight}, {effectiveFps} FPS.
          </span>
        </div>
      )}
      {localExportCapability?.status === 'limited' && (
        <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-xl p-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            This browser may not support H.264 at {effectiveWidth} × {effectiveHeight}, {effectiveFps} FPS. Try a lower resolution or 30 FPS.
          </span>
        </div>
      )}
      {localExportCapability?.status === 'unsupported' && (
        <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-xl p-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>This browser does not support local MP4 export. Use a current desktop version of Chrome or Edge.</span>
        </div>
      )}

      {/* Progress bar */}
      {isExporting && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">
              {phase === 'prewarm' ? 'Preparing map tiles' : 'Exporting frames'}
            </span>
            <span className="text-xs font-mono text-muted-foreground">{progress}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && <div className="text-xs text-destructive bg-destructive/10 rounded-xl p-3">{error}</div>}

      {/* Success Local */}
      {!isExporting && progress === 100 && !error && (
        <div className="text-xs text-primary bg-primary/10 rounded-xl p-3 flex items-center gap-2">
          <Download size={14} /> Export complete. The file was downloaded.
        </div>
      )}

      {/* Success Cloud */}
      {cloudSubmitted && !error && (
        <div className="text-xs text-primary bg-primary/10 rounded-xl p-3 flex items-center gap-2">
          <Cloud size={14} /> Cloud render queued. Open Cloud renders to check progress and download the file.
        </div>
      )}
    </div>
  );
}

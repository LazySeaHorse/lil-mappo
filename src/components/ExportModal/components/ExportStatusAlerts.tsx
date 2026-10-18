import React from 'react';
import { ArrowRight, Crown, LogIn } from 'lucide-react';
import type { ExportLimits } from '@/lib/cloudAccess';

interface ExportStatusAlertsProps {
  limits: ExportLimits;
  /** Guests: say before the click that exporting needs an account. */
  requiresSignIn?: boolean;
  exportDuration: number;
  effectiveWidth: number;
  effectiveHeight: number;
  totalFrames: number;
  onOpenUpgrade: () => void;
}

/**
 * The notes under the export form. Only notes that hold for the whole visit live here, so the popup does not
 * change height during an export: progress and browser support live in the Export button, and "keep this tab
 * open", "export complete" and errors in the line under the title.
 */
export function ExportStatusAlerts({
  limits,
  requiresSignIn = false,
  exportDuration,
  effectiveWidth,
  effectiveHeight,
  totalFrames,
  onOpenUpgrade,
}: ExportStatusAlertsProps) {
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-4 gap-3 border-y border-border/60 py-3">
        <Spec label="Duration" value={`${exportDuration.toFixed(1)} s`} />
        <Spec label="Size" value={`${effectiveWidth} × ${effectiveHeight}`} />
        <Spec label="Frames" value={String(totalFrames)} />
        <Spec label="Format" value="MP4" />
      </dl>

      {requiresSignIn && (
        <Note icon={<LogIn size={15} />}>You need an account to export video. Signing in is free.</Note>
      )}

      {limits.limited && (
        <Note icon={<Crown size={15} />}>
          <span>
            <span className="font-medium text-foreground">Free plan limit:</span> 720p, 30 FPS, and 30 seconds.{' '}
            <button
              type="button"
              onClick={onOpenUpgrade}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              Use a paid plan or your own Mapbox token for higher limits <ArrowRight size={12} />
            </button>
          </span>
        </Note>
      )}
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

/** One look for every note: an icon and a sentence on a light tint. */
function Note({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-primary/15 bg-primary/[0.05] px-3.5 py-3 text-[13px] leading-relaxed text-muted-foreground">
      <span className="mt-[3px] shrink-0 text-primary">{icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

import React from 'react';
import { LogIn } from 'lucide-react';

interface ExportStatusAlertsProps {
  /** Guests: say before the click that exporting needs an account. */
  requiresSignIn?: boolean;
  exportDuration: number;
  effectiveWidth: number;
  effectiveHeight: number;
  totalFrames: number;
}

/**
 * The notes under the export form. Only notes that hold for the whole visit live here, so the popup does not
 * change height during an export: progress and browser support live in the Export button, and "keep this tab
 * open", "export complete" and errors in the line under the title. Plan limits are not a note either: picking a
 * Pro setting turns the Export button into Get Wanderer.
 */
export function ExportStatusAlerts({
  requiresSignIn = false,
  exportDuration,
  effectiveWidth,
  effectiveHeight,
  totalFrames,
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

    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="text-2xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

/** One look for every note: an icon and a sentence on a light tint. */
function Note({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-primary/15 bg-primary/[0.05] px-3.5 py-3 text-sm leading-relaxed text-muted-foreground">
      <span className="mt-[3px] shrink-0 text-primary">{icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

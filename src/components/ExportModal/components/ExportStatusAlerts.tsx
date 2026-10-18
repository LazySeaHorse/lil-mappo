import React from 'react';
import { LogIn } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
        <Alert variant="info">
          <LogIn />
          <AlertDescription>You need an account to export video. Signing in is free.</AlertDescription>
        </Alert>
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

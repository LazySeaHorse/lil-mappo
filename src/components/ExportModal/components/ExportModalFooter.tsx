import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, Clapperboard, Download, LogIn, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { UpcomingFeature } from '@/components/FeatureVotes/UpcomingFeature';
import type { LocalExportCapability } from '@/services/localExportCapability';
import { cn } from '@/lib/utils';
import { localExportWarning } from '../exportStatus';

/** How long "Export complete" stays in the bar before the buttons come back. */
const COMPLETE_HOLD_MS = 1800;

interface ExportModalFooterProps {
  isExporting: boolean;
  progress: number;
  phase: 'prewarm' | 'capture';
  localExportCapability: LocalExportCapability | null;
  /** The output size and frame rate, named in the warning when the browser doubts them. */
  width: number;
  height: number;
  fps: number;
  /** Guests: the button says so up front. Clicking it still goes through `onExport`, which opens sign-in. */
  requiresSignIn?: boolean;
  onExport: () => void;
  onCancel: () => void;
}

export function ExportModalFooter({
  isExporting,
  progress,
  phase,
  localExportCapability,
  width,
  height,
  fps,
  requiresSignIn = false,
  onExport,
  onCancel,
}: ExportModalFooterProps) {
  const completing = useCompleteHold(isExporting, progress);
  // While exporting, and for a moment after, Cloud render folds away and the Export button is the progress bar.
  const folded = isExporting || completing;

  const cloudRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // React 18 does not pass `inert` through, so set it here: a folded control must not take focus.
    if (cloudRef.current) cloudRef.current.inert = folded;
  }, [folded]);

  return (
    <div
      className={cn(
        'grid px-6 pb-6 pt-2 transition-[grid-template-columns,column-gap] duration-500 ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none',
        folded ? 'grid-cols-[0fr_1fr] gap-x-0' : 'grid-cols-[1fr_1fr] gap-x-3',
      )}
    >
      {/* Cloud rendering is not built yet: a split segment (label + heart) opens the idea and vote dialog. */}
      <div
        ref={cloudRef}
        data-slot="export-cloud"
        aria-hidden={folded || undefined}
        className={cn(
          'min-w-0 overflow-hidden transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none',
          folded && 'pointer-events-none -translate-x-6 scale-95 opacity-0',
        )}
      >
        <UpcomingFeature featureId="cloud-render" variant="control" className="w-full rounded-[10px]" />
      </div>

      <div className="min-w-0">
        {folded ? (
          <ExportProgress
            progress={completing ? 100 : progress}
            label={completing ? 'complete' : phase}
            onCancel={isExporting ? onCancel : undefined}
          />
        ) : (
          <ExportButton
            capability={localExportCapability}
            warning={localExportWarning(localExportCapability, width, height, fps)}
            requiresSignIn={requiresSignIn}
            exportedBefore={progress === 100}
            onExport={onExport}
          />
        )}
      </div>
    </div>
  );
}

/** True for a moment after an export finishes and saves, so the full bar can say so. */
function useCompleteHold(isExporting: boolean, progress: number): boolean {
  const [holding, setHolding] = useState(false);
  const wasExporting = useRef(isExporting);
  useEffect(() => {
    const finished = wasExporting.current && !isExporting && progress === 100;
    wasExporting.current = isExporting;
    if (!finished) return;
    setHolding(true);
    const timer = window.setTimeout(() => setHolding(false), COMPLETE_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [isExporting, progress]);
  return holding;
}

interface ExportButtonProps {
  capability: LocalExportCapability | null;
  warning: string | null;
  requiresSignIn: boolean;
  exportedBefore: boolean;
  onExport: () => void;
}

function ExportButton({ capability, warning, requiresSignIn, exportedBefore, onExport }: ExportButtonProps) {
  const warningId = useId();
  const disabled = !capability || capability.status === 'unsupported';

  const button = (
    <Button
      onClick={onExport}
      disabled={disabled}
      aria-describedby={warning ? warningId : undefined}
      className="h-11 w-full min-w-0 gap-2 rounded-[10px] px-3 text-sm font-medium"
    >
      {requiresSignIn ? (
        <>
          <LogIn size={16} /> Sign in to export
        </>
      ) : exportedBefore ? (
        <>
          <Download size={16} /> Export again
        </>
      ) : (
        <>
          <Clapperboard size={16} /> Export locally
        </>
      )}
      {warning && <TriangleAlert data-slot="export-warning" size={16} aria-hidden="true" className="ml-0.5 shrink-0" />}
    </Button>
  );

  if (!warning) return button;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A disabled button gets no pointer or focus events, so the wrapper carries the tooltip. */}
          <span className="block" tabIndex={disabled ? 0 : undefined}>
            {button}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-pretty">{warning}</TooltipContent>
      </Tooltip>
      <span id={warningId} className="sr-only">
        {warning}
      </span>
    </>
  );
}

interface ExportProgressProps {
  progress: number;
  label: 'prewarm' | 'capture' | 'complete';
  /** Absent once the export has finished. */
  onCancel?: () => void;
}

/**
 * The Export button, filled up as the progress bar. The label is drawn twice, once over the track and once over
 * the fill, so it reads on both sides of the fill's edge.
 */
function ExportProgress({ progress, label, onCancel }: ExportProgressProps) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  const complete = label === 'complete';
  const text = complete ? 'Export complete' : label === 'prewarm' ? 'Preparing map tiles' : 'Exporting frames';

  const content = (
    <>
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        {complete && <Check size={16} className="shrink-0" />}
        {text}
      </span>
      {!complete && <span className="font-mono text-xs tabular-nums">{pct}%</span>}
    </>
  );
  const layer = cn(
    'absolute inset-0 flex items-center gap-3 text-sm font-medium',
    complete ? 'justify-center px-4' : 'justify-between pl-4 pr-12',
  );

  return (
    <div
      role="progressbar"
      aria-label="Export progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={complete ? 'Export complete' : `${text}, ${pct}%`}
      className="relative h-11 overflow-hidden rounded-[10px] bg-primary/15"
    >
      <div className={cn(layer, 'text-primary')}>{content}</div>
      <div
        aria-hidden="true"
        className={cn(layer, 'bg-primary text-primary-foreground transition-[clip-path] duration-200 ease-linear motion-reduce:transition-none')}
        style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
      >
        {content}
      </div>
      {onCancel && (
        <button
          type="button"
          aria-label="Cancel export"
          onClick={onCancel}
          className={cn(
            'absolute right-1.5 top-1.5 z-10 grid size-8 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            pct > 90 ? 'text-primary-foreground hover:bg-white/15' : 'text-primary hover:bg-primary/10',
          )}
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}

import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore } from '@/store/useAuthStore';
import { useShallow } from 'zustand/react/shallow';
import { useRenderJobs, type RenderJobListItem } from '@/hooks/useRenderJobs';
import type { RenderStatus } from '@/lib/database.types';
import { STATUS_LABELS } from '@/lib/database.types';
import type { ExportResolution } from '@/types/render';
import { RESOLUTION_LABELS } from '@/types/render';
import {
  Clapperboard, RefreshCcw, LogIn, Loader2, Download,
  RotateCcw, Clock, CheckCircle2, AlertCircle, Hourglass
} from 'lucide-react';
import { PinDropHero } from '@/components/ui/pin-drop';
import { pinDropContentClass, popupTextClass, popupTitleClass } from '@/components/ui/popup-variants';
import { cn } from '@/lib/utils';

export function RendersModal() {
  const { showRendersModal, closeRendersModal } = useAuthStore(
    useShallow((s) => ({
      showRendersModal: s.showRendersModal,
      closeRendersModal: s.closeRendersModal,
    })),
  );

  return (
    <Dialog open={showRendersModal} onOpenChange={(open) => !open && closeRendersModal()}>
      <DialogContent className={cn(pinDropContentClass, "sm:max-w-[540px]")}>
        <PinDropHero mood="reel" scene="renders" size="compact" />
        <DialogHeader className="px-6 pb-4 text-left">
          <DialogTitle className={popupTitleClass}>Cloud renders</DialogTitle>
          <DialogDescription className={popupTextClass}>
            View cloud-render status and download completed files.
          </DialogDescription>
        </DialogHeader>
        {showRendersModal && <RendersModalBody />}
      </DialogContent>
    </Dialog>
  );
}

function RendersModalBody() {
  const { user, closeRendersModal, openAuthModal } = useAuthStore(
    useShallow((s) => ({
      user: s.user,
      closeRendersModal: s.closeRendersModal,
      openAuthModal: s.openAuthModal,
    })),
  );
  const { data: jobs, isLoading, error, refetch, isFetching } = useRenderJobs();

  return (
    <div className="px-6 pb-6">
      {!user ? (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center shadow-inner">
            <LogIn size={28} className="text-primary" />
          </div>
          <div className="text-center">
            <p className="font-medium text-lg tracking-tight">Sign in to view renders</p>
            <p className="text-muted-foreground text-sm mt-2 max-w-[280px] leading-relaxed">
              Cloud rendering creates the video on our servers.
            </p>
          </div>
          <Button
            size="lg"
            className="mt-2"
            onClick={() => { closeRendersModal(); openAuthModal(); }}
          >
            Sign in
          </Button>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <p className="text-sm font-medium text-destructive">Cannot load renders.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCcw size={13} className="mr-1.5" /> Try again
          </Button>
        </div>
      ) : !jobs || jobs.length === 0 ? (
        <EmptyState
          icon={Clapperboard}
          title="No cloud renders"
          description="Start a cloud render from Export. It appears here."
        />
      ) : (
        <div className="flex flex-col relative">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-medium text-foreground/80">
              Recent renders
            </span>
            <Button
              variant="secondary"
              size="xs"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCcw size={12} className={`mr-1.5 ${isFetching ? 'animate-spin text-primary' : ''}`} />
              {isFetching ? 'Refreshing' : 'Refresh status'}
            </Button>
          </div>

          <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-1 pb-2">
            {jobs.map((job) => (
              <RenderJobRow key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RenderJobRow({ job }: { job: RenderJobListItem }) {
  const isExpired = job.expires_at ? new Date(job.expires_at) < new Date() : false;
  const expiresIn = job.expires_at && !isExpired
    ? getTimeRemaining(new Date(job.expires_at))
    : null;

  return (
    <div className="group bg-secondary/20 hover:bg-secondary/40 border border-border/30 rounded-xl p-4 flex items-start gap-4 transition-colors">
      <div className="mt-1 shrink-0 p-2 rounded-full bg-background/50 shadow-sm border border-border/40">
        <StatusIcon status={job.status} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium tracking-tight truncate">
            {(() => {
              const resLabel = job.resolution_preset
                ? (RESOLUTION_LABELS[job.resolution_preset as ExportResolution] ?? job.resolution_preset)
                : (job.resolution ?? 'Custom');
              const orientLabel = job.is_vertical ? 'Portrait' : 'Landscape';
              const arLabel = job.aspect_ratio ?? '';
              return `${resLabel}${arLabel ? `, ${arLabel}` : ''}, ${orientLabel}, ${job.fps ?? 'Unknown'} FPS`;
            })()}
          </span>
          <StatusBadge status={job.status} />
        </div>

        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground font-medium flex-wrap">
          <span className="bg-background/40 px-2 py-0.5 rounded-md border border-border/30">
            {new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          {job.duration_sec && (
            <span className="flex items-center gap-1">
              <Clock size={12} /> {job.duration_sec.toFixed(0)}s video
            </span>
          )}
          <span className="text-foreground/80 font-medium">{job.credits_cost} credit{job.credits_cost !== 1 ? 's' : ''}</span>

          {expiresIn && (
            <Badge variant="warning">
              <Hourglass /> {expiresIn} left
            </Badge>
          )}
          {isExpired && job.status === 'done' && (
            <span className="text-muted-foreground/60 line-through decoration-muted-foreground/30">Expired</span>
          )}
        </div>

        {job.error_message && (
          <p className="text-2xs font-medium text-destructive mt-2 truncate bg-destructive/10 px-2 py-1 rounded border border-destructive/20">
            {job.error_message}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 self-center">
        {job.status === 'done' && job.output_url && !isExpired && (
          <Button
            asChild
          >
            <a href={job.output_url} download target="_blank" rel="noreferrer">
              <Download size={14} /> Download
            </a>
          </Button>
        )}
        {(job.status === 'failed' || isExpired) && (
          <Button
            variant="outline"
            title="Re-render (costs credits)"
          >
            <RotateCcw size={14} /> Retry
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: RenderStatus }) {
  switch (status) {
    case 'done': return <CheckCircle2 size={18} className="text-success" />;
    case 'failed': return <AlertCircle size={18} className="text-destructive" />;
    case 'rendering': return <Loader2 size={18} className="animate-spin text-primary" />;
    case 'queued': return <Hourglass size={18} className="text-muted-foreground" />;
  }
}

function StatusBadge({ status }: { status: RenderStatus }) {
  const variants = {
    done: 'success',
    failed: 'danger',
    rendering: 'info',
    queued: 'muted',
  } as const satisfies Record<RenderStatus, BadgeProps['variant']>;
  return (
    <Badge size="sm" variant={variants[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function getTimeRemaining(date: Date): string {
  const ms = date.getTime() - Date.now();
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

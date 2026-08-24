import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore } from '@/store/useAuthStore';
import { useRenderJobs } from '@/hooks/useRenderJobs';
import type { RenderJob, RenderStatus } from '@/lib/database.types';
import { STATUS_LABELS } from '@/lib/database.types';
import type { ExportResolution } from '@/types/render';
import { RESOLUTION_LABELS } from '@/types/render';
import {
  Clapperboard, RefreshCcw, LogIn, Loader2, Download,
  RotateCcw, Clock, CheckCircle2, AlertCircle, Hourglass, PlayCircle
} from 'lucide-react';

export function RendersModal() {
  const { showRendersModal, closeRendersModal } = useAuthStore();

  return (
    <Dialog open={showRendersModal} onOpenChange={(open) => !open && closeRendersModal()}>
      <DialogContent className="sm:max-w-[540px] rounded-2xl bg-background/95 border-border/40 shadow-2xl p-0 overflow-hidden">
        <div className="p-6 pb-4 bg-gradient-to-b from-secondary/40 to-transparent">
          <DialogHeader>
            <DialogTitle className="text-2xl font-medium tracking-tight flex items-center gap-2">
              <PlayCircle className="text-primary h-6 w-6" /> Cloud renders
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm mt-1">
              View cloud-render status and download completed files.
            </DialogDescription>
          </DialogHeader>
        </div>
        {showRendersModal && <RendersModalBody />}
      </DialogContent>
    </Dialog>
  );
}

function RendersModalBody() {
  const { user, closeRendersModal, openAuthModal } = useAuthStore();
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
            className="mt-2 rounded-lg h-10 px-8 font-medium shadow-lg shadow-primary/20 transition-all"
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
          <Button variant="outline" size="sm" className="rounded-lg text-xs px-4" onClick={() => refetch()}>
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
              size="sm"
              className="h-7 px-3 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 border border-border/50 text-foreground transition-colors"
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

function RenderJobRow({ job }: { job: RenderJob }) {
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
            <span className="flex items-center gap-1 text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md font-medium">
              <Hourglass size={10} /> {expiresIn} left
            </span>
          )}
          {isExpired && job.status === 'done' && (
            <span className="text-muted-foreground/60 line-through decoration-muted-foreground/30">Expired</span>
          )}
        </div>

        {job.error_message && (
          <p className="text-[11px] font-medium text-destructive mt-2 truncate bg-destructive/10 px-2 py-1 rounded border border-destructive/20">
            {job.error_message}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 self-center">
        {job.status === 'done' && job.output_url && !isExpired && (
          <Button
            size="sm"
            className="h-9 px-4 rounded-lg gap-1.5 shadow-md hover:shadow-lg transition-all font-medium"
            asChild
          >
            <a href={job.output_url} download target="_blank" rel="noreferrer">
              <Download size={14} /> Download
            </a>
          </Button>
        )}
        {(job.status === 'failed' || isExpired) && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 px-3 rounded-lg gap-1.5 text-muted-foreground hover:text-foreground transition-all"
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
    case 'done': return <CheckCircle2 size={18} className="text-emerald-500" />;
    case 'failed': return <AlertCircle size={18} className="text-destructive" />;
    case 'rendering': return <Loader2 size={18} className="animate-spin text-blue-500" />;
    case 'queued': return <Hourglass size={18} className="text-muted-foreground" />;
  }
}

function StatusBadge({ status }: { status: RenderStatus }) {
  const colors: Record<RenderStatus, string> = {
    done: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    failed: 'bg-destructive/15 text-destructive border-destructive/20',
    rendering: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20',
    queued: 'bg-secondary text-muted-foreground border-border/50',
  };
  return (
    <span className={`text-[10px] font-medium uppercase tracking-widest px-2 py-0.5 rounded-md border shadow-sm ${colors[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function getTimeRemaining(date: Date): string {
  const ms = date.getTime() - Date.now();
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

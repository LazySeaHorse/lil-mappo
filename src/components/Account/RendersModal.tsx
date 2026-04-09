import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';
import { useRenderJobs } from '@/hooks/useRenderJobs';
import type { RenderJob, RenderStatus } from '@/lib/database.types';
import { STATUS_LABELS } from '@/lib/database.types';
import {
  Clapperboard, RefreshCcw, LogIn, Loader2, Download,
  RotateCcw, Clock, CheckCircle2, AlertCircle, Hourglass, PlayCircle
} from 'lucide-react';

export function RendersModal() {
  const { user, showRendersModal, closeRendersModal, openAuthModal } = useAuthStore();
  const { data: jobs, isLoading, error, refetch, isFetching } = useRenderJobs();

  return (
    <Dialog open={showRendersModal} onOpenChange={(open) => !open && closeRendersModal()}>
      <DialogContent className="sm:max-w-[540px] rounded-3xl bg-background/95 border-border/40 shadow-2xl p-0 overflow-hidden">

        {/* Header */}
        <div className="p-6 pb-4 bg-gradient-to-b from-secondary/40 to-transparent">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-2">
              <PlayCircle className="text-primary h-6 w-6" /> My Renders
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm mt-1">
              Your recent cloud renders and downloadable exports.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6">
          {!user ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center shadow-inner">
                <LogIn size={28} className="text-primary" />
              </div>
              <div className="text-center">
                <p className="font-bold text-lg tracking-tight">Sign in to view renders</p>
                <p className="text-muted-foreground text-sm mt-2 max-w-[280px] leading-relaxed">
                  Cloud renders let you export high-quality videos without tying up your browser.
                </p>
              </div>
              <Button
                className="mt-2 rounded-xl h-10 px-8 font-semibold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                onClick={() => { closeRendersModal(); openAuthModal(); }}
              >
                Sign In
              </Button>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <p className="text-sm font-medium text-destructive">Failed to load renders.</p>
              <Button variant="outline" size="sm" className="rounded-xl text-xs px-4" onClick={() => refetch()}>
                <RefreshCcw size={13} className="mr-1.5" /> Retry Connection
              </Button>
            </div>
          ) : !jobs || jobs.length === 0 ? (
            <div className="flex flex-col items-center gap-5 py-12">
              <div className="w-20 h-20 rounded-full bg-secondary/50 flex items-center justify-center shadow-inner">
                <Clapperboard size={32} className="text-muted-foreground/40" />
              </div>
              <div className="text-center">
                <p className="font-bold text-base">No renders yet</p>
                <p className="text-muted-foreground text-sm mt-1.5 max-w-[280px] leading-relaxed">
                  Submit a cloud render from the export panel and it will appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col relative">
              {/* Toolbar */}
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70">
                  Recent Activity
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 px-3 text-[10px] uppercase font-bold tracking-wider rounded-lg bg-secondary hover:bg-secondary/80 border border-border/50 text-foreground transition-colors"
                  onClick={() => refetch()}
                  disabled={isFetching}
                >
                  <RefreshCcw size={12} className={`mr-1.5 ${isFetching ? 'animate-spin text-primary' : ''}`} />
                  {isFetching ? 'Refreshing...' : 'Refresh Status'}
                </Button>
              </div>

              {/* Renders List */}
              <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-1 pb-2">
                {jobs.map((job) => (
                  <RenderJobRow key={job.id} job={job} />
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RenderJobRow({ job }: { job: RenderJob }) {
  const isExpired = job.expires_at ? new Date(job.expires_at) < new Date() : false;
  const expiresIn = job.expires_at && !isExpired
    ? getTimeRemaining(new Date(job.expires_at))
    : null;

  return (
    <div className="group bg-secondary/20 hover:bg-secondary/40 border border-border/30 rounded-2xl p-4 flex items-start gap-4 transition-colors">
      {/* Status icon */}
      <div className="mt-1 shrink-0 p-2 rounded-full bg-background/50 shadow-sm border border-border/40">
        <StatusIcon status={job.status} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-bold tracking-tight truncate">
            {job.resolution ?? 'Custom'} <span className="text-muted-foreground font-medium mx-1">&middot;</span> {job.fps ?? '—'} fps
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
          <span className="text-foreground/80 font-semibold">{job.credits_cost} credit{job.credits_cost !== 1 ? 's' : ''}</span>

          {expiresIn && (
            <span className="flex items-center gap-1 text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md font-semibold">
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

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0 self-center">
        {job.status === 'done' && job.output_url && !isExpired && (
          <Button
            size="sm"
            className="h-9 px-4 rounded-xl gap-1.5 shadow-md hover:shadow-lg transition-all font-semibold"
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
            className="h-9 px-3 rounded-xl gap-1.5 text-muted-foreground hover:text-foreground transition-all"
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
    case 'done': return <CheckCircle2 size={18} className="text-green-500" />;
    case 'failed': return <AlertCircle size={18} className="text-destructive" />;
    case 'rendering': return <Loader2 size={18} className="animate-spin text-blue-500" />;
    case 'queued': return <Hourglass size={18} className="text-muted-foreground" />;
  }
}

function StatusBadge({ status }: { status: RenderStatus }) {
  const colors: Record<RenderStatus, string> = {
    done: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20',
    failed: 'bg-destructive/15 text-destructive border-destructive/20',
    rendering: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20',
    queued: 'bg-secondary text-muted-foreground border-border/50',
  };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border shadow-sm ${colors[status]}`}>
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

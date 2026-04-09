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
  RotateCcw, Clock, CheckCircle2, AlertCircle, Hourglass,
} from 'lucide-react';

export function RendersModal() {
  const { user, showRendersModal, closeRendersModal, openAuthModal } = useAuthStore();
  const { data: jobs, isLoading, error, refetch, isFetching } = useRenderJobs();

  return (
    <Dialog open={showRendersModal} onOpenChange={(open) => !open && closeRendersModal()}>
      <DialogContent className="sm:max-w-lg rounded-2xl bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-bold tracking-tight">My Renders</DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm mt-0.5">
                Cloud render history and downloads.
              </DialogDescription>
            </div>
            {user && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-lg"
                title="Refresh"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCcw size={14} className={isFetching ? 'animate-spin' : ''} />
              </Button>
            )}
          </div>
        </DialogHeader>

        {!user ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <LogIn size={24} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-sm">Sign in to view renders</p>
              <p className="text-muted-foreground text-xs mt-1 max-w-[260px] leading-relaxed">
                Cloud renders let you export high-quality videos without tying up your browser.
              </p>
            </div>
            <Button
              size="sm"
              className="rounded-xl text-xs h-9 px-6"
              onClick={() => { closeRendersModal(); openAuthModal(); }}
            >
              Sign In
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-sm text-muted-foreground">Failed to load renders.</p>
            <Button variant="outline" size="sm" className="rounded-lg text-xs" onClick={() => refetch()}>
              <RefreshCcw size={13} className="mr-1.5" /> Retry
            </Button>
          </div>
        ) : !jobs || jobs.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-10">
            <div className="w-14 h-14 rounded-full bg-secondary/50 flex items-center justify-center">
              <Clapperboard size={24} className="text-muted-foreground/50" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-sm">No renders yet</p>
              <p className="text-muted-foreground text-xs mt-1 max-w-[260px] leading-relaxed">
                Submit a cloud render and it'll appear here with its status and download link.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1 pt-1">
            {jobs.map((job) => (
              <RenderJobRow key={job.id} job={job} />
            ))}
          </div>
        )}
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
    <div className="bg-secondary/30 rounded-xl p-3.5 flex items-start gap-3">
      {/* Status icon */}
      <div className="mt-0.5 shrink-0">
        <StatusIcon status={job.status} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold truncate">
            {job.resolution ?? '—'} · {job.fps ?? '—'}fps
          </span>
          <StatusBadge status={job.status} />
        </div>
        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
          <span>{new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          {job.duration_sec && <span>{job.duration_sec.toFixed(0)}s video</span>}
          <span>{job.credits_cost} credit{job.credits_cost !== 1 ? 's' : ''}</span>
          {expiresIn && (
            <span className="flex items-center gap-1 text-amber-500">
              <Clock size={10} /> Expires in {expiresIn}
            </span>
          )}
          {isExpired && job.status === 'done' && (
            <span className="text-muted-foreground/50">Expired</span>
          )}
        </div>
        {job.error_message && (
          <p className="text-[10px] text-destructive mt-1 truncate">{job.error_message}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {job.status === 'done' && job.output_url && !isExpired && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-[10px] rounded-lg gap-1"
            asChild
          >
            <a href={job.output_url} download target="_blank" rel="noreferrer">
              <Download size={11} /> Download
            </a>
          </Button>
        )}
        {(job.status === 'failed' || isExpired) && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[10px] rounded-lg gap-1 text-muted-foreground"
            title="Re-render (costs credits)"
          >
            <RotateCcw size={11} /> Re-render
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: RenderStatus }) {
  switch (status) {
    case 'done':     return <CheckCircle2 size={16} className="text-green-500" />;
    case 'failed':   return <AlertCircle size={16} className="text-destructive" />;
    case 'rendering':return <Loader2 size={16} className="animate-spin text-blue-400" />;
    case 'queued':   return <Hourglass size={16} className="text-muted-foreground" />;
  }
}

function StatusBadge({ status }: { status: RenderStatus }) {
  const colors: Record<RenderStatus, string> = {
    done:      'bg-green-500/10 text-green-600 dark:text-green-400',
    failed:    'bg-destructive/10 text-destructive',
    rendering: 'bg-blue-500/10 text-blue-500',
    queued:    'bg-secondary text-muted-foreground',
  };
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${colors[status]}`}>
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

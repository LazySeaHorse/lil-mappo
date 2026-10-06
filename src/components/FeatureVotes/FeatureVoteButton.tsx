import React, { useState } from 'react';
import { ThumbsUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UpcomingFeatureId } from '@/config/upcomingFeatures';
import { FeatureVoteDialog } from './FeatureVoteDialog';

interface FeatureVoteButtonProps {
  featureId: UpcomingFeatureId;
  className?: string;
}

/** Small "I'd like this" pill that opens the feature preview and vote dialog. */
export function FeatureVoteButton({ featureId, className }: FeatureVoteButtonProps) {
  const [open, setOpen] = useState(false);
  // Mount the dialog on first use so closed pills cost nothing (no vote query, no extra tree).
  const [everOpened, setEverOpened] = useState(false);

  return (
    <>
      <button
        type="button"
        data-ph-unmask
        onClick={() => {
          setEverOpened(true);
          setOpen(true);
        }}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          className,
        )}
      >
        <ThumbsUp size={12} aria-hidden="true" />
        I'd like this
      </button>
      {everOpened && <FeatureVoteDialog featureId={featureId} open={open} onOpenChange={setOpen} />}
    </>
  );
}

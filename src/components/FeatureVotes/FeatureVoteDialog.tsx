import React, { useEffect, useRef } from 'react';
import { Heart, TrendingUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';
import { track } from '@/lib/analytics';
import { useFeatureVotes, useSetFeatureVote } from '@/hooks/useFeatureVotes';
import {
  MOST_REQUESTED_LABEL,
  TIER_COPY,
  getUpcomingFeature,
  type UpcomingFeatureId,
} from '@/config/upcomingFeatures';
import { GallerySkeleton, RenderSkeleton } from './FeatureSkeletons';

interface FeatureVoteDialogProps {
  featureId: UpcomingFeatureId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Preview {
  intro: string;
  /** Short labelled lists render as bullets; omit for a plain paragraph block. */
  sections: { heading: string; items: string[] }[];
  footnote?: string;
  skeleton: React.ReactNode;
}

const PREVIEWS: Record<UpcomingFeatureId, Preview> = {
  'example-projects': {
    intro:
      'Example projects would be a small gallery of curated projects you could open, play with and learn from. We might also let people publish their own projects for anyone to browse.',
    sections: [],
    footnote: 'Nothing like this exists yet. A rough idea of the layout is below.',
    skeleton: <GallerySkeleton />,
  },
  'cloud-render': {
    intro:
      'Cloud rendering would make the video on our servers instead of in your browser. You would send the project off, and download the finished file when it is ready.',
    sections: [
      {
        heading: 'The good',
        items: [
          'You would not need to keep the tab open.',
          'It would work on weaker devices.',
          'Higher resolution and frame rates, without your own GPU or encoder limits.',
        ],
      },
      {
        heading: 'The catch',
        items: [
          'It would use paid credits or a subscription.',
          'Uploading and waiting in a queue takes time.',
          'It depends on our servers being up, and your project data leaves your device.',
          'Exporting locally stays free and keeps working offline.',
        ],
      },
    ],
    footnote: 'Not built yet. A rough idea of the progress view is below.',
    skeleton: <RenderSkeleton />,
  },
};

export function FeatureVoteDialog({ featureId, open, onOpenChange }: FeatureVoteDialogProps) {
  const user = useAuthStore((s) => s.user);
  const requestSignIn = useAuthStore((s) => s.requestSignIn);
  const feature = getUpcomingFeature(featureId);
  const preview = PREVIEWS[featureId];

  const votes = useFeatureVotes(open);
  const setVote = useSetFeatureVote();
  const summary = votes.data?.find((r) => r.feature_id === featureId);

  // Count each opening once.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) track('feature_preview_opened', { feature_id: featureId });
    wasOpen.current = open;
  }, [open, featureId]);

  const handleSignIn = () => {
    onOpenChange(false);
    requestSignIn('Sign in to vote for upcoming features.');
  };

  const handleToggle = () => {
    if (!summary || setVote.isPending) return;
    // The feature_voted/unvoted event is tracked by the hook once the vote is saved.
    setVote.mutate({ featureId, voted: !summary.has_voted });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto rounded-2xl bg-background/95 border-border/40 shadow-2xl p-0 gap-0">
        <div className="p-6 pb-4 bg-gradient-to-b from-secondary/40 to-transparent border-b border-border/40">
          <DialogHeader className="pr-6">
            <DialogTitle className="text-xl font-medium tracking-tight">{feature.title}</DialogTitle>
            <DialogDescription className="text-sm mt-1">Not built yet</DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-4" data-ph-unmask>
          <p className="text-sm text-foreground/90 leading-relaxed">{preview.intro}</p>

          {preview.sections.map((section) => (
            <div key={section.heading}>
              <h3 className="text-xs font-medium text-foreground/80 mb-1.5">{section.heading}</h3>
              <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground leading-relaxed marker:text-muted-foreground/50">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}

          {preview.skeleton}
          {preview.footnote && <p className="text-xs text-muted-foreground">{preview.footnote}</p>}
        </div>

        <div className="px-6 py-4 border-t border-border/40 bg-secondary/10 flex flex-col sm:flex-row sm:items-center gap-3" data-ph-unmask>
          {user ? (
            <>
              <div className="flex-1 min-w-0 text-sm" aria-live="polite">
                {votes.isError ? (
                  <span className="text-muted-foreground">
                    Could not load votes right now.{' '}
                    <button
                      type="button"
                      onClick={() => void votes.refetch()}
                      className="text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    >
                      Try again
                    </button>
                  </span>
                ) : summary ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground">{TIER_COPY[summary.tier]}</span>
                    {summary.most_requested && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
                        <TrendingUp size={12} aria-hidden="true" /> {MOST_REQUESTED_LABEL}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">Loading votes…</span>
                )}
              </div>
              {/* One stable accessible name; the pressed state is carried by aria-pressed, and the visible
                  text and heart show it too ("You asked for this" + filled pink heart).
                  aria-disabled (not `disabled`) so keyboard focus stays on the button while a vote is saved;
                  handleToggle ignores activation in that state. */}
              <Button
                type="button"
                variant={summary?.has_voted ? 'outline' : 'default'}
                aria-label="I'd like this"
                aria-pressed={summary?.has_voted ?? false}
                aria-disabled={!summary || setVote.isPending}
                onClick={handleToggle}
                className="h-10 rounded-lg gap-2 w-full sm:w-auto aria-pressed:border-wish/45 aria-pressed:bg-wish/10 aria-pressed:hover:bg-wish/15 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
              >
                <Heart
                  size={16}
                  aria-hidden="true"
                  className={summary?.has_voted ? 'fill-wish text-wish' : undefined}
                />
                {summary?.has_voted ? 'You asked for this' : "I'd like this"}
              </Button>
            </>
          ) : (
            <>
              <p className="flex-1 text-sm text-muted-foreground">Votes help us decide what to build next.</p>
              <Button type="button" onClick={handleSignIn} className="h-10 rounded-lg w-full sm:w-auto">
                Sign in to vote
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

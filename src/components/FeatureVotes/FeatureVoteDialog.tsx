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
import { PinDropHero } from '@/components/ui/pin-drop';
import { useAuthStore } from '@/store/useAuthStore';
import { track } from '@/lib/analytics';
import { useFeatureVotes, useSetFeatureVote } from '@/hooks/useFeatureVotes';
import {
  MOST_REQUESTED_LABEL,
  TIER_COPY,
  getUpcomingFeature,
  type UpcomingFeatureId,
} from '@/config/upcomingFeatures';
import { EarthSkeleton, GallerySkeleton, MultiEditSkeleton, OverlaysSkeleton, RenderSkeleton } from './FeatureSkeletons';

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
  'google-earth': {
    intro:
      'Google Earth would be a map style that draws its real-world 3D: photographed buildings, trees and terrain, so a city looks the way it does in life.',
    sections: [
      {
        heading: 'Benefits',
        items: [
          'Real buildings and landmarks instead of simple blocks.',
          'Great for travel, property and city videos.',
        ],
      },
      {
        heading: 'Constraints',
        items: [
          "Google's data comes with its own terms and costs, so it may be limited to paid plans.",
          'Detail and coverage vary by place.',
          "Google's credit would show on the map.",
        ],
      },
    ],
    footnote: 'A preview of the difference is below, flat blocks on the left and real buildings on the right.',
    skeleton: <EarthSkeleton />,
  },
  overlays: {
    intro:
      'Overlays are your own graphics on top of the map in the video: a logo, a title, stickers, photos. Place them, choose when they show on the timeline, and they come out in your export.',
    sections: [
      {
        heading: 'What you could add',
        items: ['A logo or watermark.', 'Text, with your choice of font and colour.', 'Stickers.', 'Your own images.'],
      },
      {
        heading: 'How it would work',
        items: [
          'Drag to place and resize an overlay right on the video frame.',
          'Each overlay gets a bar on the timeline, so you choose when it appears and disappears.',
        ],
      },
    ],
    footnote: 'A preview of the frame and its layers is below.',
    skeleton: <OverlaysSkeleton />,
  },
  'multi-edit-groups': {
    intro:
      'Select several clips on the timeline with Shift-click and change what they share in one go. Group them to keep a long timeline tidy.',
    sections: [
      {
        heading: 'Editing together',
        items: [
          'Select clips of one type, like routes or callouts, and the inspector shows their shared settings.',
          'A setting that differs between them reads "Mixed". Change it and every selected clip gets your value.',
        ],
      },
      {
        heading: 'Groups',
        items: [
          'Press Ctrl+G (Cmd+G on a Mac) to group the selection. The group gets a colour dot and a collapse arrow beside the timeline.',
          'Collapse a group into one bar that moves all of its clips together.',
          'Click the dot to change the colour or ungroup.',
        ],
      },
    ],
    footnote: 'A preview of the timeline and inspector is below.',
    skeleton: <MultiEditSkeleton />,
  },
  'example-projects': {
    intro:
      'Example projects provides a small gallery of curated projects to open, inspect, and learn from. Users can also publish their own projects for anyone to browse.',
    sections: [],
    footnote: 'A preview of the layout is below.',
    skeleton: <GallerySkeleton />,
  },
  'cloud-render': {
    intro:
      'Cloud rendering processes video on remote servers instead of in your browser. Send the project, and download the finished file when it is ready.',
    sections: [
      {
        heading: 'Benefits',
        items: [
          'You do not need to keep the tab open.',
          'Works on lower-end devices.',
          'Higher resolution and frame rates without local GPU or encoder limits.',
        ],
      },
      {
        heading: 'Constraints',
        items: [
          'Requires credits or an active subscription.',
          'Uploading and waiting in a queue takes time.',
          'Depends on server availability, and project data leaves your device.',
          'Exporting locally stays free and keeps working offline.',
        ],
      },
    ],
    footnote: 'A preview of the progress view is below.',
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
      <DialogContent size="md">
        <PinDropHero mood="balloon" scene="soon" size="compact" />
        <DialogHeader className="px-6 text-left">
          <DialogTitle>{feature.title}</DialogTitle>
          <DialogDescription>Not built yet</DialogDescription>
        </DialogHeader>

        <div className="px-6 pt-4 pb-6 space-y-4" data-ph-unmask>
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
                size="lg"
                type="button"
                variant={summary?.has_voted ? 'wish' : 'default'}
                aria-label="I'd like this"
                aria-pressed={summary?.has_voted ?? false}
                aria-disabled={!summary || setVote.isPending}
                onClick={handleToggle}
                className="w-full sm:w-auto"
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
              <Button size="lg" type="button" onClick={handleSignIn} className="w-full sm:w-auto">
                Sign in to vote
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

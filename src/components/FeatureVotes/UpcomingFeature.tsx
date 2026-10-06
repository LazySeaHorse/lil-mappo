import React, { useEffect, useRef, useState } from 'react';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthStore } from '@/store/useAuthStore';
import { useFeatureVoted } from '@/hooks/useFeatureVotes';
import { getUpcomingFeature, type UpcomingFeatureId } from '@/config/upcomingFeatures';
import { FeatureVoteDialog } from './FeatureVoteDialog';

export type UpcomingFeatureVariant = 'control' | 'inline';

interface UpcomingFeatureProps {
  featureId: UpcomingFeatureId;
  /**
   * `control`: full-size split segment standing in for the unbuilt control (label half + heart half).
   * `inline`: small "I'd like this" text button for empty states, settings rows and cards.
   */
  variant: UpcomingFeatureVariant;
  className?: string;
}

const TOOLTIP = 'Not built yet. See the idea and ask for it.';

/**
 * Heart that marks an unbuilt feature. Outline = not asked for, filled pink = you asked for it.
 * The pop only plays when the vote flips on after the dialog was used, never when a saved vote loads.
 */
function WishHeart({ voted, size, animate }: { voted: boolean; size: number; animate: boolean }) {
  const prev = useRef(voted);
  const [popping, setPopping] = useState(false);
  useEffect(() => {
    // `animate` is true only once the dialog has been used, so a vote loading in on mount does not pop.
    if (voted && !prev.current && animate) setPopping(true);
    prev.current = voted;
  }, [voted, animate]);
  return (
    <Heart
      size={size}
      aria-hidden="true"
      data-voted={voted}
      onAnimationEnd={() => setPopping(false)}
      className={cn(voted ? 'fill-wish text-wish' : 'text-muted-foreground', popping && 'wish-pop')}
    />
  );
}

interface TriggerProps extends UpcomingFeatureProps {
  voted: boolean;
}

function Trigger({ featureId, variant, className, voted }: TriggerProps) {
  const [open, setOpen] = useState(false);
  // Mount the dialog on first use so a closed trigger costs nothing beyond the shared vote query.
  const [everOpened, setEverOpened] = useState(false);
  const feature = getUpcomingFeature(featureId);

  const openDialog = () => {
    setEverOpened(true);
    setOpen(true);
  };

  const common = {
    type: 'button' as const,
    'aria-haspopup': 'dialog' as const,
    'data-ph-unmask': true,
    onClick: openDialog,
  };

  const dialog = everOpened && <FeatureVoteDialog featureId={featureId} open={open} onOpenChange={setOpen} />;

  if (variant === 'inline') {
    return (
      <>
        <button
          {...common}
          aria-label={voted ? `You asked for this, ${feature.title}` : `I'd like this, ${feature.title}`}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            'min-h-8 [@media(pointer:coarse)]:min-h-11',
            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            voted
              ? 'border-wish/45 bg-wish/10 text-wish hover:bg-wish/15'
              : 'border-border bg-background text-foreground hover:bg-accent',
            className,
          )}
        >
          <WishHeart voted={voted} size={14} animate={everOpened} />
          {voted ? 'You asked' : "I'd like this"}
        </button>
        {dialog}
      </>
    );
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            {...common}
            aria-label={`${feature.title}, not built yet${voted ? ', you asked for it' : ''}`}
            className={cn(
              // Same height as the primary button beside it; the heart half is a square segment.
              'group flex h-11 min-w-0 items-stretch overflow-hidden rounded-md border border-dashed border-muted-foreground/50 bg-background text-sm font-medium text-muted-foreground transition-colors',
              'hover:border-muted-foreground hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              className,
            )}
          >
            <span className="flex min-w-0 flex-1 items-center justify-center whitespace-nowrap px-1.5 sm:px-3">
              {feature.title}
            </span>
            <span
              className={cn(
                'flex w-9 shrink-0 sm:w-11 items-center justify-center border-l',
                voted
                  ? 'border-wish/45 bg-wish/10 group-hover:bg-wish/15'
                  : 'border-muted-foreground/50 group-hover:bg-accent',
              )}
            >
              <WishHeart voted={voted} size={18} animate={everOpened} />
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>{TOOLTIP}</TooltipContent>
      </Tooltip>
      {dialog}
    </>
  );
}

/** Reads the signed-in user's vote; only rendered for signed-in users so signed-out pages make no request. */
function SignedInTrigger(props: UpcomingFeatureProps) {
  const voted = useFeatureVoted(props.featureId);
  return <Trigger {...props} voted={voted} />;
}

/**
 * Stand-in for a feature that is not built yet: opens a preview dialog where signed-in users can ask for it.
 * Signed-out users see the outline heart (no request) and "Sign in to vote" in the dialog.
 */
export function UpcomingFeature(props: UpcomingFeatureProps) {
  const signedIn = useAuthStore((s) => !!s.user);
  return signedIn ? <SignedInTrigger {...props} /> : <Trigger {...props} voted={false} />;
}

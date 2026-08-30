import React, { useEffect, useState } from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
} from '@floating-ui/react';
import { ArrowRight, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import type { MapGesture } from './walkthroughState';
import type { WalkthroughStepConfig } from './walkthroughSteps';

interface CoachmarkOverlayProps {
  step: WalkthroughStepConfig;
  stepIndex: number;
  totalSteps: number;
  isMobile: boolean;
  gestures: Record<MapGesture, boolean>;
  onSkip: () => void;
  onNext: () => void;
}

interface RectBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function CoachmarkOverlay({
  step,
  stepIndex,
  totalSteps,
  isMobile,
  gestures,
  onSkip,
  onNext,
}: CoachmarkOverlayProps) {
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [spotlightRect, setSpotlightRect] = useState<RectBox | null>(null);

  // Locate the target and spotlight elements in the DOM
  useEffect(() => {
    let active = true;

    const findElements = () => {
      if (!active) return;
      const targetEl = document.querySelector<HTMLElement>(step.target);
      const spotlightEl = step.spotlightTarget
        ? document.querySelector<HTMLElement>(step.spotlightTarget)
        : targetEl;

      setTargetElement(targetEl);

      if (spotlightEl) {
        const b = spotlightEl.getBoundingClientRect();
        const padding = step.spotlightPadding ?? 6;
        setSpotlightRect({
          x: Math.max(0, b.left - padding),
          y: Math.max(0, b.top - padding),
          width: Math.min(window.innerWidth, b.width + padding * 2),
          height: Math.min(window.innerHeight, b.height + padding * 2),
        });
      } else {
        setSpotlightRect(null);
      }
    };

    findElements();

    // Re-check periodically in case target element mounts asynchronously
    const interval = setInterval(findElements, 100);
    window.addEventListener('resize', findElements);
    window.addEventListener('scroll', findElements, true);

    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('resize', findElements);
      window.removeEventListener('scroll', findElements, true);
    };
  }, [step.target, step.spotlightTarget, step.spotlightPadding]);

  const { refs, floatingStyles } = useFloating({
    elements: { reference: targetElement },
    placement: step.placement || 'bottom',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(12),
      flip({
        fallbackAxisSideDirection: 'start',
        padding: 16,
      }),
      shift({ padding: 16 }),
    ],
  });

  const showPrimary = step.buttons?.includes('primary');
  const showSkip = step.buttons?.includes('skip');
  const isLastStep = stepIndex === totalSteps - 1;
  const progressPercent = Math.round(((stepIndex + 1) / totalSteps) * 100);
  const nextLabel = step.nextLabel || (isLastStep ? 'Finish' : 'Next');

  if (!targetElement) return null;

  return (
    <>
      {/* Spotlight cutout mask over entire screen */}
      {!step.hideOverlay && (
        <svg
          className="fixed inset-0 w-full h-full pointer-events-none select-none z-[119]"
          style={{ pointerEvents: 'none' }}
          aria-hidden="true"
        >
          <defs>
            <mask id="walkthrough-spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" style={{ pointerEvents: 'none' }} />
              {spotlightRect && (
                <rect
                  x={spotlightRect.x}
                  y={spotlightRect.y}
                  width={spotlightRect.width}
                  height={spotlightRect.height}
                  rx="12"
                  ry="12"
                  fill="black"
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0, 0, 0, 0.65)"
            mask="url(#walkthrough-spotlight-mask)"
            style={{ pointerEvents: 'none' }}
          />
          {spotlightRect && (
            <rect
              x={spotlightRect.x}
              y={spotlightRect.y}
              width={spotlightRect.width}
              height={spotlightRect.height}
              rx="12"
              ry="12"
              fill="none"
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="1"
              style={{ pointerEvents: 'none' }}
            />
          )}
        </svg>
      )}

      {/* Floating Tooltip Card */}
      <div
        ref={refs.setFloating}
        style={{
          ...floatingStyles,
          fontFamily: "'Outfit', sans-serif",
        }}
        className="z-[120] w-[calc(100vw-24px)] max-w-sm sm:max-w-md rounded-2xl bg-background/95 backdrop-blur-xl border border-border/50 shadow-2xl shadow-black/20 overflow-hidden text-foreground select-none pointer-events-auto animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Top progress indicator bar */}
        <div className="h-1 w-full bg-secondary/60 relative overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="p-4 sm:p-5 flex flex-col gap-3">
          {/* Header: Step Counter Badge & Close/Skip Button */}
          <div className="flex items-center justify-between gap-2">
            <Badge
              variant="secondary"
              className="font-mono-time text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-secondary/70 border border-border/40 text-muted-foreground font-medium"
            >
              Step {stepIndex + 1} of {totalSteps}
            </Badge>

            {showSkip && (
              <IconButton
                type="button"
                variant="ghost"
                size="xs"
                className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                title="Skip tour"
                aria-label="Skip tour"
                data-action="skip"
                onClick={onSkip}
              >
                <X size={13} />
              </IconButton>
            )}
          </div>

          {/* Title */}
          {step.title && (
            <h3 className="text-sm sm:text-base font-semibold tracking-tight text-foreground leading-snug">
              {step.title}
            </h3>
          )}

          {/* Content */}
          <div className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {step.renderContent({ isMobile, gestures })}
          </div>

          {/* Footer actions */}
          <div className="pt-2 mt-0.5 border-t border-border/30 flex items-center justify-between gap-2">
            <div>
              {!showPrimary ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/15">
                  <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                  Action required
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground/75 font-mono-time">
                  {progressPercent}% completed
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {showSkip && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                  data-action="skip"
                  onClick={onSkip}
                  aria-label="Skip tour"
                  title="Skip tour"
                >
                  Skip tour
                </Button>
              )}

              {showPrimary && (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 px-3 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow-sm gap-1.5"
                  data-action="next"
                  onClick={onNext}
                  aria-label={nextLabel}
                  title={nextLabel}
                >
                  <span>{nextLabel}</span>
                  <ArrowRight size={12} className="shrink-0" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

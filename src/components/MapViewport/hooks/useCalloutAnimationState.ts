import { useMemo } from 'react';
import type { CalloutItem } from '@/store/types';

interface CalloutAnimationState {
  isVisible: boolean;
  phase: 'enter' | 'visible' | 'exit';
  progress: number;
}

/**
 * Compute animation state for all callouts based on playheadTime.
 * This is done once per frame in the parent, avoiding per-marker subscriptions.
 */
export function useCalloutAnimationState(
  playheadTime: number,
  isMoveModeActive: boolean,
  selectedCalloutId: string | null,
  callouts: CalloutItem[]
): Record<string, CalloutAnimationState> {
  return useMemo(() => {
    const states: Record<string, CalloutAnimationState> = {};

    for (const callout of callouts) {
      const isSelected = selectedCalloutId === callout.id;
      const isActuallyInMoveMode = isSelected && isMoveModeActive;

      // Determine if visible in time
      const isVisibleTime = playheadTime >= callout.startTime && playheadTime <= callout.endTime;
      const isVisible = isActuallyInMoveMode || isVisibleTime;

      // Calculate animation phase and progress
      let phase: 'enter' | 'visible' | 'exit' = 'visible';
      let progress = 1;

      if (playheadTime < callout.startTime) {
        // Before start: not visible
        phase = 'enter';
        progress = 0;
      } else {
        const enterEnd = callout.startTime + callout.animation.enterDuration;
        const exitStart = callout.endTime - callout.animation.exitDuration;

        if (playheadTime < enterEnd) {
          phase = 'enter';
          progress = (playheadTime - callout.startTime) / callout.animation.enterDuration;
        } else if (playheadTime > exitStart) {
          phase = 'exit';
          progress = (playheadTime - exitStart) / callout.animation.exitDuration;
        } else {
          phase = 'visible';
          progress = 1;
        }
      }

      states[callout.id] = {
        isVisible,
        phase,
        progress,
      };
    }

    return states;
  }, [playheadTime, isMoveModeActive, selectedCalloutId, callouts]);
}

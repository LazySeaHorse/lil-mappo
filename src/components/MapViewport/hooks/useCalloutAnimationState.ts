import { useMemo } from 'react';
import type { CalloutItem } from '@/store/types';
import { computeCalloutPhase } from '@/engine/calloutAnimation';

interface CalloutUIAnimationState {
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
): Record<string, CalloutUIAnimationState> {
  return useMemo(() => {
    const states: Record<string, CalloutUIAnimationState> = {};

    for (const callout of callouts) {
      const isSelected = selectedCalloutId === callout.id;
      const isActuallyInMoveMode = isSelected && isMoveModeActive;

      // Determine if visible in time
      const isVisibleTime = playheadTime >= callout.startTime && playheadTime <= callout.endTime;
      const isVisible = isActuallyInMoveMode || isVisibleTime;

      // Calculate animation phase and progress
      const phaseResult = computeCalloutPhase(callout, playheadTime);
      const phase = phaseResult?.phase ?? 'enter';
      const progress = phaseResult?.progress ?? 0;

      states[callout.id] = {
        isVisible,
        phase,
        progress,
      };
    }

    return states;
  }, [playheadTime, isMoveModeActive, selectedCalloutId, callouts]);
}

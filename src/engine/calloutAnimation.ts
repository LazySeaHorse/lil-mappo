import type { CalloutItem } from '@/store/types';

/**
 * Compute the animation phase and progress for a callout at a given playhead time.
 * Returns null if the callout is not within its time window.
 * The returned progress is clamped to [0, 1].
 */
export function computeCalloutPhase(
  callout: CalloutItem,
  playheadTime: number
): { phase: 'enter' | 'visible' | 'exit'; progress: number } | null {
  if (playheadTime < callout.startTime || playheadTime > callout.endTime) return null;

  const enterEnd = callout.startTime + callout.animation.enterDuration;
  const exitStart = callout.endTime - callout.animation.exitDuration;

  if (playheadTime < enterEnd) {
    return {
      phase: 'enter',
      progress: Math.min((playheadTime - callout.startTime) / callout.animation.enterDuration, 1),
    };
  } else if (playheadTime > exitStart) {
    return {
      phase: 'exit',
      progress: Math.min((playheadTime - exitStart) / callout.animation.exitDuration, 1),
    };
  }

  return { phase: 'visible', progress: 1 };
}

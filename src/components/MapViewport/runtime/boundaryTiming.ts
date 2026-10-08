import { clamp } from '@/engine/cameraPose';
import { getNormalizedProgress } from '@/engine/easings';
import type { BoundaryItem } from '@/store/types';

export const BOUNDARY_EXIT_DURATION = 0.5;

/** A drawn or traced outline leaves the first 70% of its progress to the stroke; the fill comes in over the rest. */
const FILL_START = 0.7;

/**
 * Maps the part of `progress` between `start` and `end` onto 0-1, clamped. Exactly 1
 * at `end`: the numerator and denominator are the same float there, where a
 * hand-written `(p - 0.7) / 0.3` lands on 1.0000000000000002.
 */
export function progressWithin(progress: number, start: number, end = 1): number {
  if (end <= start) return progress >= end ? 1 : 0;
  return clamp((progress - start) / (end - start), 0, 1);
}

export interface BoundaryTiming {
  /** Eased 0-1 progress between startTime and endTime. */
  progress: number;
  exitProgress: number;
  /** 1 - exitProgress; the factor the exit animations fade or erase with. */
  reverseProgress: number;
  fadeExit: boolean;
  reverseExit: boolean;
  animationStyle: BoundaryItem['style']['animationStyle'];
  /**
   * Factor the fill (and the outside mask) is scaled by, including the fade exit. Always
   * within [0, 1] and exactly 1 once fully drawn: Mapbox rejects opacities outside that
   * range and keeps the old value.
   */
  fillFactor: number;
}

/** Shared by the fill and the shared outside mask so both follow the same curve. */
export function resolveBoundaryTiming(
  boundary: Pick<BoundaryItem, 'startTime' | 'endTime' | 'easing' | 'exitAnimation' | 'style'>,
  playheadTime: number,
): BoundaryTiming {
  const style = boundary.style;
  const progress = getNormalizedProgress(playheadTime, boundary.startTime, boundary.endTime, boundary.easing);
  const isExiting = boundary.exitAnimation !== 'none' && playheadTime > boundary.endTime;
  const exitProgress = isExiting ? Math.min((playheadTime - boundary.endTime) / BOUNDARY_EXIT_DURATION, 1) : 0;
  const reverseProgress = 1 - exitProgress;
  const fadeExit = boundary.exitAnimation === 'fade' && isExiting;
  const reverseExit = boundary.exitAnimation === 'reverse' && isExiting;
  const animationStyle = style.animationStyle ?? 'fade';

  let fillProgress: number;
  if (reverseExit) {
    fillProgress = (!style.animateStroke || animationStyle !== 'draw')
      ? reverseProgress
      : progressWithin(reverseProgress, FILL_START);
  } else if (!style.animateStroke) {
    fillProgress = progress > 0 ? 1 : 0;
  } else if (animationStyle === 'fade') {
    fillProgress = progress;
  } else {
    fillProgress = progressWithin(progress, FILL_START);
  }
  const fillFactor = fadeExit ? fillProgress * reverseProgress : fillProgress;

  return { progress, exitProgress, reverseProgress, fadeExit, reverseExit, animationStyle, fillFactor };
}

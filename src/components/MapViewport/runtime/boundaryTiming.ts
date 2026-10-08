import { getNormalizedProgress } from '@/engine/easings';
import type { BoundaryItem } from '@/store/types';

export const BOUNDARY_EXIT_DURATION = 0.5;

export interface BoundaryTiming {
  /** Eased 0-1 progress between startTime and endTime. */
  progress: number;
  exitProgress: number;
  /** 1 - exitProgress; the factor the exit animations fade or erase with. */
  reverseProgress: number;
  fadeExit: boolean;
  reverseExit: boolean;
  animationStyle: BoundaryItem['style']['animationStyle'];
  /** 0-1 factor the fill (and the outside mask) is scaled by, including the fade exit. */
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
      : Math.max(0, (reverseProgress - 0.7) / 0.3);
  } else if (!style.animateStroke) {
    fillProgress = progress > 0 ? 1 : 0;
  } else if (animationStyle === 'fade') {
    fillProgress = progress;
  } else {
    fillProgress = Math.max(0, (progress - 0.7) / 0.3);
  }
  const fillFactor = fadeExit ? fillProgress * reverseProgress : fillProgress;

  return { progress, exitProgress, reverseProgress, fadeExit, reverseExit, animationStyle, fillFactor };
}

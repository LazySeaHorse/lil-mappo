import { getNormalizedProgress } from '@/engine/easings';
import type { RouteItem } from '@/store/types';
import { exitTiming } from './exitTiming';

export interface RouteTiming {
  /** Eased 0-1 progress between startTime and endTime. */
  progress: number;
  isBeforeStart: boolean;
  /** Past the end with an exit animation running (or finished). */
  exitActive: boolean;
  /** 0-1 through the exit animation; 0 while it is not active. */
  exitProgress: number;
  /** The exit animation has finished: nothing is drawn any more. */
  isAfterExit: boolean;
  /** Opacity of the line and vehicle: 1, fading to 0 through a fade exit. */
  opacity: number;
}

/** When a route draws and leaves, shared by the line and its vehicle. */
export function routeTiming(
  route: Pick<RouteItem, 'startTime' | 'endTime' | 'easing' | 'exitAnimation'>,
  playheadTime: number,
): RouteTiming {
  const progress = getNormalizedProgress(playheadTime, route.startTime, route.endTime, route.easing);
  const { active: exitActive, progress: exitProgress } = exitTiming(route, playheadTime);
  return {
    progress,
    isBeforeStart: playheadTime < route.startTime,
    exitActive,
    exitProgress,
    isAfterExit: exitProgress >= 1,
    opacity: route.exitAnimation === 'fade' && exitActive ? 1 - exitProgress : 1,
  };
}

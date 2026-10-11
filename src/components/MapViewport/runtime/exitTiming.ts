import type { ExitAnimation } from '@/store/types';

/** Seconds a fade or reverse exit takes after an item's endTime. */
export const EXIT_DURATION = 0.5;

export interface ExitTiming {
  /** Past the end with a fade or reverse exit running (or finished). */
  active: boolean;
  /** 0-1 through the exit animation; 0 while it is not active. */
  progress: number;
}

/**
 * How far a route or boundary is through its exit. Only 'fade' and 'reverse' leave; 'none'
 * keeps the item on screen, fully drawn, after its end.
 */
export function exitTiming(
  item: { endTime: number; exitAnimation?: ExitAnimation },
  playheadTime: number,
): ExitTiming {
  const leaves = item.exitAnimation === 'fade' || item.exitAnimation === 'reverse';
  const active = leaves && playheadTime > item.endTime;
  return { active, progress: active ? Math.min((playheadTime - item.endTime) / EXIT_DURATION, 1) : 0 };
}

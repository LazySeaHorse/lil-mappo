import { computePhase } from '@/annotations/animation';
import { clamp01, easeInCubic, easeOutBack, easeOutCubic } from '@/annotations/motion';
import type { ModelEnter, ModelExit, ModelItem } from '@/store/types';

/** How a placed model is drawn at one moment: all 1 when fully shown. */
export interface ModelFrame {
  opacity: number;
  /** Uniform size factor (pop). */
  scale: number;
  /** Height factor from the ground up (rise and sink). */
  height: number;
}

const SHOWN: ModelFrame = { opacity: 1, scale: 1, height: 1 };

export const MODEL_ENTER_OPTIONS: readonly ModelEnter[] = ['none', 'fade', 'scale-up', 'rise'];
export const MODEL_EXIT_OPTIONS: readonly ModelExit[] = ['none', 'fade', 'scale-down', 'sink'];

/** How much a model is built up (0 gone, 1 shown) shaped by one animation. */
function shaped(name: ModelEnter | ModelExit, built: number, entering: boolean): ModelFrame {
  const p = clamp01(built);
  switch (name) {
    case 'fade':
      return { ...SHOWN, opacity: p };
    case 'scale-up':
    case 'scale-down':
      // In: pops past full size and settles. Out: shrinks away, speeding up.
      return { ...SHOWN, scale: entering ? easeOutBack(p) : 1 - easeInCubic(1 - p) };
    case 'rise':
    case 'sink':
      return { ...SHOWN, height: entering ? easeOutCubic(p) : 1 - easeInCubic(1 - p) };
    default:
      return SHOWN;
  }
}

/**
 * The model at `time`, or null when it is not on screen. Like a callout, it shows from its start to
 * its end, playing its appear animation at the start and its disappear animation before the end.
 * Animations longer than the item share its length. `settled` (the editor previewing the
 * selection) shows it in full.
 */
export function modelFrame(item: ModelItem, time: number, { settled = false } = {}): ModelFrame | null {
  if (settled) return SHOWN;
  const { enter, exit } = item.transition;
  const length = Math.max(0, item.endTime - item.startTime);
  let enterDuration = enter === 'none' ? 0 : Math.max(0, item.transition.enterDuration);
  let exitDuration = exit === 'none' ? 0 : Math.max(0, item.transition.exitDuration);
  const total = enterDuration + exitDuration;
  if (total > length && total > 0) {
    enterDuration *= length / total;
    exitDuration *= length / total;
  }
  const phase = computePhase(item.startTime, item.endTime, enterDuration, exitDuration, time);
  if (!phase) return null;
  if (phase.phase === 'enter') return shaped(enter, phase.progress, true);
  if (phase.phase === 'exit') return shaped(exit, 1 - phase.progress, false);
  return SHOWN;
}

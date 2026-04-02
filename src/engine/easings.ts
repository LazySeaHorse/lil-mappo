import type { EasingName } from '@/store/types';

const easingFns: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => (--t) * t * t + 1,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

export function applyEasing(name: EasingName, t: number): number {
  return easingFns[name](Math.max(0, Math.min(1, t)));
}

export function getNormalizedProgress(playhead: number, start: number, end: number, easing: EasingName): number {
  if (playhead < start) return 0;
  if (playhead > end) return 1;
  const t = (playhead - start) / (end - start);
  return applyEasing(easing, t);
}

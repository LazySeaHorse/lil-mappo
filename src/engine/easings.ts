import type { EasingName } from '@/store/types';

function easeOutBounce(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) {
    return n1 * t * t;
  } else if (t < 2 / d1) {
    const t2 = t - 1.5 / d1;
    return n1 * t2 * t2 + 0.75;
  } else if (t < 2.5 / d1) {
    const t2 = t - 2.25 / d1;
    return n1 * t2 * t2 + 0.9375;
  } else {
    const t2 = t - 2.625 / d1;
    return n1 * t2 * t2 + 0.984375;
  }
}

const easingFns: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => (--t) * t * t + 1,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  easeInOutSine: (t) => (1 - Math.cos(Math.PI * t)) / 2,
  bounce: easeOutBounce,
};

export function applyEasing(name: EasingName, t: number): number {
  const fn = easingFns[name] || easingFns.easeInOutSine;
  return fn(Math.max(0, Math.min(1, t)));
}

export function getNormalizedProgress(playhead: number, start: number, end: number, easing: EasingName): number {
  if (playhead < start) return 0;
  if (playhead > end) return 1;
  const t = (playhead - start) / (end - start);
  return applyEasing(easing, t);
}

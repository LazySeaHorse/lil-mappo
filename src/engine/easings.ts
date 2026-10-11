/** Every easing an item or keyframe can name, in picker order. */
export const EASING_NAMES = [
  'linear',
  'easeInQuad', 'easeOutQuad', 'easeInOutQuad',
  'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
  'easeInOutSine',
  'bounce',
] as const;

export type EasingName = (typeof EASING_NAMES)[number];

export const linear = (t: number): number => t;
export const easeInQuad = (t: number): number => t * t;
export const easeOutQuad = (t: number): number => t * (2 - t);
export const easeInOutQuad = (t: number): number => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
export const easeInCubic = (t: number): number => t * t * t;
export const easeOutCubic = (t: number): number => (--t) * t * t + 1;
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
export const easeInOutSine = (t: number): number => (1 - Math.cos(Math.PI * t)) / 2;

export function easeOutBounce(t: number): number {
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
  linear,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  easeInOutSine,
  bounce: easeOutBounce,
};

export function applyEasing(name: EasingName, t: number): number {
  const fn = easingFns[name] || easingFns.easeInOutSine;
  return fn(Math.max(0, Math.min(1, t)));
}

export function getNormalizedProgress(playhead: number, start: number, end: number, easing: EasingName): number {
  if (end <= start) return playhead >= start ? 1 : 0;
  if (playhead < start) return 0;
  if (playhead > end) return 1;
  const t = (playhead - start) / (end - start);
  return applyEasing(easing, t);
}

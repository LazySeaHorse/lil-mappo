/**
 * Motion helpers for style-owned choreography.
 *
 * A style receives one progress value for its whole entrance or exit. It splits
 * that into overlapping stages with `stage`, shapes each stage with an easing
 * function, and reads the result as plain 0–1 numbers to draw with.
 */

/** Maps a 0–1 input to an eased output (which may overshoot 0–1). */
export type Easing = (t: number) => number;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

// ─── Easing ───────────────────────────────────────────────────────────────────

export const linear: Easing = (t) => t;

export const easeOutQuad: Easing = (t) => 1 - (1 - t) * (1 - t);

export const easeOutCubic: Easing = (t) => 1 - Math.pow(1 - t, 3);

export const easeInCubic: Easing = (t) => t * t * t;

export const easeInOutCubic: Easing = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Overshoots 1 by a few percent, then settles back. Larger `overshoot` swings further. */
export function easeOutBack(t: number, overshoot = 1.70158): number {
  // Exact at the ends, so "not started" and "finished" can be tested with ===.
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c = overshoot + 1;
  return 1 + c * Math.pow(t - 1, 3) + overshoot * Math.pow(t - 1, 2);
}

// ─── Staging ──────────────────────────────────────────────────────────────────

/**
 * Progress of a stage that runs from `start` to `end` on the parent's 0–1
 * timeline: 0 before it starts, 1 after it ends, eased in between. Stages may
 * overlap freely.
 */
export function stage(progress: number, start: number, end: number, ease: Easing = linear): number {
  if (end <= start) return ease(progress >= end ? 1 : 0);
  return ease(clamp01((progress - start) / (end - start)));
}

/**
 * How built-up a style is: 0 when nothing is drawn, 1 when complete. Entering
 * builds up, visible is complete, and exiting plays the build in reverse, so a
 * style only has to describe its entrance.
 */
export function buildProgress(phase: 'enter' | 'visible' | 'exit', phaseProgress: number): number {
  if (phase === 'enter') return clamp01(phaseProgress);
  if (phase === 'exit') return 1 - clamp01(phaseProgress);
  return 1;
}

/**
 * Progress of item `index` of `count` when items start one after another (for
 * per-letter or per-row reveals). `spread` is the share of the timeline used to
 * offset the starts; each item then takes the remaining share to play out, so
 * the last one finishes exactly at progress 1.
 */
export function staggered(
  progress: number,
  index: number,
  count: number,
  spread = 0.6,
  ease: Easing = linear,
): number {
  const start = count > 1 ? (spread * index) / (count - 1) : 0;
  return stage(progress, start, start + (1 - spread), ease);
}

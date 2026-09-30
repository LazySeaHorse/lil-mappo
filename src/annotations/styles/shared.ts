/**
 * Pieces every callout style draws the same way: the house shadow, which side
 * a label takes, the ground dot and the leader line to it, and turning a
 * measured scene into style bounds. Style-specific shadows (a photo print's
 * drop, a flag's cloth) stay in their own files.
 */

import type { SceneNode, Shadow, StyleBounds } from '../types';
import { shadowLayers } from '../scene/shadows';
import { measureScene } from '../scene/measure';
import { circle, group, polyline } from '../scene/primitives';

// ─── Shadow ───────────────────────────────────────────────────────────────────

/** Soft dark shadow that lifts light line work and lettering off any map. */
export const HALO_SHADOW: Shadow = [
  { color: 'rgba(0, 0, 0, 0.75)', blur: 2, offsetX: 0, offsetY: 0 },
  { color: 'rgba(0, 0, 0, 0.4)', blur: 8, offsetX: 0, offsetY: 0 },
];

/** How far the house shadow reaches past what it lights; leave this much room for it. */
export const HALO_REACH = Math.max(...shadowLayers(HALO_SHADOW).map((layer) => layer.blur));

/** The house shadow when a style's "Soft shadow" switch is on, else none. */
export function haloShadow(enabled: boolean): Shadow | undefined {
  return enabled ? HALO_SHADOW : undefined;
}

// ─── Side ─────────────────────────────────────────────────────────────────────

export type Side = 'auto' | 'left' | 'right';

/**
 * +1 when a label extends right of its origin, -1 when it extends left. Auto
 * extends away from the point, so the point sits on the near side.
 */
export function resolveDirection(side: Side, groundX: number): 1 | -1 {
  if (side === 'left') return -1;
  if (side === 'right') return 1;
  return groundX > 0 ? -1 : 1;
}

// ─── Ground dot and leader ────────────────────────────────────────────────────

export const GROUND_DOT_RADIUS = 4;
export const GROUND_RING_RADIUS = 8;

interface GroundDotOptions {
  fill: string;
  /** Outline of the dot. */
  stroke?: string;
  /** Adds a fine ring round the dot in this colour. */
  ring?: string;
  shadow?: Shadow;
}

/** The dot that marks the ground point, popping in at `scale`. */
export function groundDot(ground: { x: number; y: number }, scale: number, options: GroundDotOptions): SceneNode {
  const { fill, stroke, ring, shadow } = options;
  return group({
    x: ground.x,
    y: ground.y,
    scale,
    children: [
      ...(ring ? [circle({ cx: 0, cy: 0, r: GROUND_RING_RADIUS, stroke: ring, strokeWidth: 1, opacity: 0.7, shadow })] : []),
      circle({ cx: 0, cy: 0, r: GROUND_DOT_RADIUS, fill, stroke, strokeWidth: stroke ? 1 : undefined, shadow }),
    ],
  });
}

interface LeaderOptions {
  stroke: string;
  strokeWidth: number;
  /** Fraction of the line drawn, from the ground point. */
  progress: number;
  shadow?: Shadow;
}

/** The line from the ground point to where a card or label attaches, drawn on from the ground. */
export function leaderLine(
  ground: { x: number; y: number },
  to: [number, number],
  options: LeaderOptions,
): SceneNode {
  return polyline({ points: [[ground.x, ground.y], to], lineCap: 'round', ...options });
}

// ─── Measure ──────────────────────────────────────────────────────────────────

/** Style bounds of a scene: pass the finished state plus any boxes that add room for overshoot. */
export function boundsOf(...nodes: SceneNode[]): StyleBounds {
  const box = measureScene(group({ children: nodes }));
  return { x: box.minX, y: box.minY, width: box.width, height: box.height };
}

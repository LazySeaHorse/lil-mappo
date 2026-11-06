/**
 * The drop shared by the styles that are a pin standing on the point: the pin
 * falls onto it from above, its shadow grows under it and it squashes as it
 * lands. A style adds what opens inside or beside the head after that.
 */

import type { SceneNode, ShadowConfig, StyleBounds } from '../types';
import { easeOutCubic, stage } from '../motion';
import { circle, group } from '../scene/primitives';

/** Shadow of the pin itself, with the head lifted off the map. */
export const PIN_SHADOW: ShadowConfig = { color: 'rgba(0, 0, 0, 0.45)', blur: 10, offsetX: 0, offsetY: 4 };
const GROUND_SHADOW = 'rgba(0, 0, 0, 0.35)';
const GROUND_SHADOW_RADIUS = 12;
/** The ground shadow is a disc squashed to this share of its height. */
const GROUND_SHADOW_FLATTEN = 0.35;

/** Height the pin falls from. */
export const DROP_HEIGHT = 70;
/** Squash on landing: the pin widens and shortens by this share, about its tip. */
export const SQUASH = 0.14;

/**
 * Windows of the 0–1 build progress: the fall and the shadow come first, the
 * squash as the pin lands, then what opens in the head (`CONTENT_WINDOW`).
 */
const SHADOW_WINDOW = [0, 0.42] as const;
const FALL_WINDOW = [0, 0.42] as const;
const SQUASH_WINDOW = [0.42, 0.62] as const;
export const CONTENT_WINDOW = [0.45, 0.8] as const;

export interface PinDrop {
  shadowGrow: number;
  fall: number;
  squash: number;
}

export function pinDrop(build: number): PinDrop {
  return {
    shadowGrow: stage(build, ...SHADOW_WINDOW, easeOutCubic),
    fall: stage(build, ...FALL_WINDOW, (t) => t * t),
    squash: Math.sin(Math.PI * stage(build, ...SQUASH_WINDOW)),
  };
}

/** The flat shadow on the ground under the pin's tip, once it has started to grow. */
export function groundShadow({ shadowGrow }: PinDrop): SceneNode[] {
  if (shadowGrow <= 0) return [];
  return [group({
    scaleY: GROUND_SHADOW_FLATTEN,
    children: [circle({ cx: 0, cy: 0, r: GROUND_SHADOW_RADIUS * shadowGrow, fill: GROUND_SHADOW })],
  })];
}

/** The pin's parts, falling and squashing about the tip at the origin. Nothing before the fall starts. */
export function droppingPin({ fall, squash }: PinDrop, children: SceneNode[]): SceneNode[] {
  if (fall <= 0) return [];
  return [group({
    y: -DROP_HEIGHT * (1 - fall),
    scaleX: 1 + SQUASH * squash,
    scaleY: 1 - SQUASH * squash,
    anchorX: 0,
    anchorY: 0,
    opacity: Math.min(1, fall * 4),
    children,
  })];
}

/**
 * Room the drop needs round a pin of half-width `radius` whose head's top is at
 * `headTop` (negative, above the tip): the fall above it, the squash and the shadow.
 */
export function pinDropBounds(radius: number, headTop: number): StyleBounds {
  const shadowReach = PIN_SHADOW.blur + (PIN_SHADOW.offsetY ?? 0);
  const halfWidth = radius * (1 + SQUASH) + shadowReach;
  const top = headTop - DROP_HEIGHT - shadowReach;
  return { x: -halfWidth, y: top, width: halfWidth * 2, height: shadowReach - top };
}

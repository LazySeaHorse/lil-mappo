/**
 * Builder helpers for constructing SceneNode trees.
 * These reduce boilerplate in style render functions.
 */

import type {
  GroupNode,
  RectNode,
  CircleNode,
  TextNode,
  ImageNode,
  LineNode,
  PathNode,
  SceneNode,
  ShadowConfig,
} from '../types';

// ─── Group ────────────────────────────────────────────────────────────────────

export function group(
  props: Omit<GroupNode, 'type' | 'children'> & { children?: SceneNode[] },
): GroupNode {
  return { type: 'group', children: [], ...props };
}

// ─── Rect ─────────────────────────────────────────────────────────────────────

export function rect(props: Omit<RectNode, 'type'>): RectNode {
  return { type: 'rect', ...props };
}

/** Convenience for a pill-shaped rect (cornerRadius = height / 2). */
export function pill(props: Omit<RectNode, 'type' | 'cornerRadius'>): RectNode {
  return { type: 'rect', cornerRadius: props.height / 2, ...props };
}

// ─── Circle ───────────────────────────────────────────────────────────────────

export function circle(props: Omit<CircleNode, 'type'>): CircleNode {
  return { type: 'circle', ...props };
}

// ─── Text ─────────────────────────────────────────────────────────────────────

export function text(props: Omit<TextNode, 'type'>): TextNode {
  return { type: 'text', ...props };
}

// ─── Image ────────────────────────────────────────────────────────────────────

export function image(props: Omit<ImageNode, 'type'>): ImageNode {
  return { type: 'image', ...props };
}

// ─── Line ─────────────────────────────────────────────────────────────────────

export function line(props: Omit<LineNode, 'type'>): LineNode {
  return { type: 'line', ...props };
}

// ─── Path ─────────────────────────────────────────────────────────────────────

export function path(props: Omit<PathNode, 'type'>): PathNode {
  return { type: 'path', ...props };
}

// ─── Common Shadows ───────────────────────────────────────────────────────────

export const shadows = {
  sm: { color: 'rgba(0,0,0,0.15)', blur: 4, offsetX: 0, offsetY: 2 } satisfies ShadowConfig,
  md: { color: 'rgba(0,0,0,0.25)', blur: 12, offsetX: 0, offsetY: 4 } satisfies ShadowConfig,
  lg: { color: 'rgba(0,0,0,0.4)', blur: 20, offsetX: 0, offsetY: 6 } satisfies ShadowConfig,
  glow: (color: string, blur = 12): ShadowConfig => ({
    color,
    blur,
    offsetX: 0,
    offsetY: 0,
  }),
};

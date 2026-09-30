import { describe, expect, it } from 'vitest';
import type { CircleNode, GroupNode, PolylineNode } from '../types';
import { boundsOf, GROUND_DOT_RADIUS, groundDot, HALO_SHADOW, haloShadow, leaderLine, resolveDirection } from './shared';
import { circle } from '../scene/primitives';

describe('haloShadow', () => {
  it('is the house shadow when enabled and nothing when not', () => {
    expect(haloShadow(true)).toBe(HALO_SHADOW);
    expect(haloShadow(false)).toBeUndefined();
  });
});

describe('resolveDirection', () => {
  it('extends away from the point when auto, and honours an explicit side', () => {
    expect(resolveDirection('auto', -70)).toBe(1); // point is left of the origin
    expect(resolveDirection('auto', 70)).toBe(-1);
    expect(resolveDirection('auto', 0)).toBe(1);
    expect(resolveDirection('left', -70)).toBe(-1);
    expect(resolveDirection('right', 70)).toBe(1);
  });
});

describe('groundDot', () => {
  const ground = { x: 30, y: 40 };

  it('sits on the ground point at the given scale', () => {
    const dot = groundDot(ground, 0.5, { fill: '#f00' }) as GroupNode;
    expect(dot).toMatchObject({ x: 30, y: 40, scale: 0.5 });
    const [disc] = dot.children as CircleNode[];
    expect(disc).toMatchObject({ r: GROUND_DOT_RADIUS, fill: '#f00' });
    expect(disc.stroke).toBeUndefined();
  });

  it('adds an outline and a ring when asked', () => {
    const dot = groundDot(ground, 1, { fill: '#f00', stroke: '#fff', ring: '#f00', shadow: HALO_SHADOW }) as GroupNode;
    const [ring, disc] = dot.children as CircleNode[];
    expect(ring.r).toBeGreaterThan(disc.r);
    expect(disc).toMatchObject({ stroke: '#fff', strokeWidth: 1, shadow: HALO_SHADOW });
  });
});

describe('leaderLine', () => {
  it('runs from the ground point to the target, drawn on by progress', () => {
    const line = leaderLine({ x: 10, y: 20 }, [0, 0], { stroke: '#fff', strokeWidth: 2, progress: 0.4 }) as PolylineNode;
    expect(line).toMatchObject({ points: [[10, 20], [0, 0]], progress: 0.4, stroke: '#fff', strokeWidth: 2, lineCap: 'round' });
  });
});

describe('boundsOf', () => {
  it('measures the union of the nodes as style bounds', () => {
    const bounds = boundsOf(
      circle({ cx: 0, cy: 0, r: 10, stroke: '#fff', strokeWidth: 0 }),
      circle({ cx: 40, cy: 0, r: 10, stroke: '#fff', strokeWidth: 0 }),
    );
    expect(bounds).toEqual({ x: -10, y: -10, width: 60, height: 20 });
  });
});

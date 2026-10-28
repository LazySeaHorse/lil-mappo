import { describe, expect, it } from 'vitest';
import type { TimelineItem } from './types';
import { orderForLane, packLanes, timelineLaneCount } from './timelineLanes';

function clip(id: string, startTime: number, endTime: number): TimelineItem {
  return { kind: 'callout', id, startTime, endTime } as TimelineItem;
}

const camera = { kind: 'camera', id: 'camera-track', keyframes: [] } as unknown as TimelineItem;

describe('packLanes', () => {
  it('puts items that never overlap in one lane, edges touching included', () => {
    expect(packLanes([clip('a', 0, 2), clip('b', 2, 4), clip('c', 5, 6)])).toEqual([['a', 'b', 'c']]);
  });

  it('puts an item under the earlier ones it overlaps, and leaves the camera out', () => {
    expect(packLanes([camera, clip('a', 0, 4), clip('b', 2, 6), clip('c', 3, 5)])).toEqual([['a'], ['b'], ['c']]);
  });

  it('keeps an item under an earlier one it overlaps even when a higher lane is free', () => {
    // b fits beside a in the top lane, but it draws over c, so it stays under c.
    expect(packLanes([clip('a', 0, 4), clip('c', 3, 6), clip('b', 5, 8)])).toEqual([['a'], ['c'], ['b']]);
  });

  it('counts the camera lane with the packed ones', () => {
    const items = { 'camera-track': camera, a: clip('a', 0, 2), b: clip('b', 3, 4), c: clip('c', 1, 3) };
    expect(timelineLaneCount(items, ['camera-track', 'a', 'b', 'c'])).toBe(3);
    expect(timelineLaneCount({ 'camera-track': camera }, ['camera-track'])).toBe(1);
  });

  it('counts again when the items or their order change', () => {
    const order = ['camera-track', 'a', 'b'];
    const apart = { 'camera-track': camera, a: clip('a', 0, 2), b: clip('b', 3, 4) };
    expect(timelineLaneCount(apart, order)).toBe(2);
    expect(timelineLaneCount(apart, order)).toBe(2);
    expect(timelineLaneCount({ ...apart, b: clip('b', 1, 4) }, order)).toBe(3);
    expect(timelineLaneCount(apart, ['camera-track', 'a'])).toBe(2);
  });
});

describe('orderForLane', () => {
  const order = ['camera-track', 'a', 'b', 'c'];
  const items = [camera, clip('a', 0, 4), clip('b', 2, 6), clip('c', 3, 5)];
  const lanes = packLanes(items);

  it('moves an item up over the items it overlaps there, and the camera keeps its place', () => {
    const next = orderForLane(order, lanes, 'c', 0);
    expect(next).toEqual(['camera-track', 'c', 'a', 'b']);
    expect(packLanes(next.map((id) => items.find((item) => item.id === id)!))).toEqual([['c'], ['a'], ['b']]);
  });

  it('moves an item down under the items it overlaps in the lane it was dropped in', () => {
    const next = orderForLane(order, lanes, 'a', 1);
    expect(next).toEqual(['camera-track', 'b', 'a', 'c']);
    expect(packLanes(next.map((id) => items.find((item) => item.id === id)!))).toEqual([['b'], ['a'], ['c']]);
  });

  it('moves an item down to a new lane at the bottom', () => {
    expect(orderForLane(order, lanes, 'a', 3)).toEqual(['camera-track', 'b', 'c', 'a']);
  });

  it('lifts an item that overlaps nothing above the lane it was dropped in', () => {
    const spread = [clip('a', 0, 2), clip('b', 1, 3), clip('c', 4, 5)];
    const next = orderForLane(['a', 'b', 'c'], packLanes(spread), 'c', 2);
    expect(packLanes(next.map((id) => spread.find((item) => item.id === id)!))).toEqual([['a', 'c'], ['b']]);
  });

  it('ignores ids the order no longer has', () => {
    expect(orderForLane(['a', 'c'], [['a', 'gone'], ['c']], 'c', 0)).toEqual(['c', 'a']);
  });
});

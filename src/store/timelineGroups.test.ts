import { beforeEach, describe, expect, it } from 'vitest';
import { act } from '@testing-library/react';
import { clearHistory, undo } from './history';
import { createProject, parseProjectDocument, toProjectDocument } from './projectDocument';
import { GROUP_COLORS, gatherInOrder, nextGroupColor, pruneGroups, withoutMembers } from './timelineGroups';
import { droppableLane, layoutLanes, orderForLane, timelineLaneCount, type GroupBlock } from './timelineLanes';
import { CAMERA_TRACK_ID, createTransientState, useProjectStore } from './useProjectStore';
import type { RouteItem, TimelineGroup } from './types';

function clip(id: string, startTime = 0, endTime = 2): RouteItem {
  return {
    kind: 'route', id, name: id, geojson: { type: 'FeatureCollection', features: [] }, startTime, endTime,
    style: { color: '#000000', width: 4, glow: false, glowWidth: 0, dashPattern: null, animationType: 'draw', cometTrailLength: 0.2 },
    easing: 'linear', exitAnimation: 'none',
  };
}

const group = (id: string, itemIds: string[], color = GROUP_COLORS[0] as string): TimelineGroup => ({ id, color, itemIds });
const state = () => useProjectStore.getState();
const ungrouped = { groups: {}, collapsedGroupIds: [] };

function setClips(...clips: RouteItem[]) {
  useProjectStore.setState({
    ...createTransientState(),
    items: { [CAMERA_TRACK_ID]: { kind: 'camera', id: CAMERA_TRACK_ID, keyframes: [] }, ...Object.fromEntries(clips.map((c) => [c.id, c])) },
    itemOrder: [CAMERA_TRACK_ID, ...clips.map((c) => c.id)],
    groups: {},
    collapsedGroupIds: [],
  });
  clearHistory();
}

describe('nextGroupColor', () => {
  it('takes colours in order and repeats only once all are used', () => {
    expect(nextGroupColor({})).toBe(GROUP_COLORS[0]);
    expect(nextGroupColor({ a: group('a', [], GROUP_COLORS[0]) })).toBe(GROUP_COLORS[1]);
    const all = Object.fromEntries(GROUP_COLORS.map((color, i) => [`g${i}`, group(`g${i}`, [], color)]));
    expect(nextGroupColor(all)).toBe(GROUP_COLORS[0]);
  });
});

describe('gatherInOrder', () => {
  it('pulls the members together at the first one', () => {
    expect(gatherInOrder(['cam', 'a', 'x', 'b', 'y', 'c'], new Set(['a', 'b', 'c']))).toEqual(['cam', 'a', 'b', 'c', 'x', 'y']);
  });
});

describe('withoutMembers', () => {
  it('returns the same object when no clip is affected', () => {
    const groups = { g: group('g', ['a', 'b']) };
    expect(withoutMembers(groups, new Set(['z']))).toBe(groups);
  });

  it('drops a group left with one clip and keeps one left with two', () => {
    const groups = { small: group('small', ['a', 'b']), big: group('big', ['c', 'd', 'e']) };
    expect(withoutMembers(groups, new Set(['a', 'c']))).toEqual({ big: group('big', ['d', 'e']) });
  });
});

describe('pruneGroups', () => {
  it('removes clips that do not exist and groups too small to stand', () => {
    const groups = { ok: group('ok', ['a', 'b', 'gone']), small: group('small', ['c', 'gone2']) };
    expect(pruneGroups(groups, { a: 1, b: 1, c: 1 })).toEqual({ ok: group('ok', ['a', 'b']) });
  });
});

describe('layoutLanes', () => {
  it('matches plain packing without groups', () => {
    const { lanes, blocks } = layoutLanes([clip('a'), clip('b'), clip('c', 3, 4)], ungrouped);
    expect(lanes).toEqual([['a', 'c'], ['b']]);
    expect(blocks).toEqual([]);
  });

  it('gives a group its own lanes, shared with nothing outside it', () => {
    const items = [clip('x'), clip('a', 5, 6), clip('b', 5, 6), clip('y', 8, 9)];
    const { lanes, blocks } = layoutLanes(items, { groups: { g: group('g', ['a', 'b']) }, collapsedGroupIds: [] });
    expect(lanes).toEqual([['x'], ['a'], ['b'], ['y']]);
    expect(blocks).toMatchObject([{ groupId: 'g', firstLane: 1, laneCount: 2, collapsed: false, memberIds: ['a', 'b'] }]);
  });

  it('keeps a group whole when its clips are apart in the order', () => {
    const { lanes } = layoutLanes([clip('a'), clip('x', 3, 4), clip('b')], { groups: { g: group('g', ['a', 'b']) }, collapsedGroupIds: [] });
    expect(lanes).toEqual([['a'], ['b'], ['x']]);
  });

  it('folds a collapsed group into one lane that still lists its clips', () => {
    const { lanes, blocks } = layoutLanes([clip('a'), clip('b')], { groups: { g: group('g', ['a', 'b']) }, collapsedGroupIds: ['g'] });
    expect(lanes).toEqual([['a', 'b']]);
    expect(blocks).toMatchObject([{ firstLane: 0, laneCount: 1, collapsed: true }]);
  });

  it('counts collapsed lanes in the timeline height', () => {
    const items = { a: clip('a'), b: clip('b') };
    expect(timelineLaneCount(items, ['a', 'b'], { groups: { g: group('g', ['a', 'b']) }, collapsedGroupIds: [] })).toBe(3);
    expect(timelineLaneCount(items, ['a', 'b'], { groups: { g: group('g', ['a', 'b']) }, collapsedGroupIds: ['g'] })).toBe(2);
  });

  it('ignores a collapsed id with no group', () => {
    expect(layoutLanes([clip('a'), clip('b')], { groups: {}, collapsedGroupIds: ['old'] }).lanes).toEqual([['a'], ['b']]);
  });
});

describe('droppableLane', () => {
  const block: GroupBlock = { groupId: 'g', color: '', firstLane: 2, laneCount: 3, collapsed: false, memberIds: ['a', 'b', 'c'] };

  it('keeps a member inside its block', () => {
    expect(droppableLane([block], 'a', 2, 9)).toBe(4);
    expect(droppableLane([block], 'a', 3, 0)).toBe(2);
    expect(droppableLane([block], 'a', 2, 3)).toBe(3);
  });

  it('sends another clip to the far side of the block', () => {
    expect(droppableLane([block], 'x', 0, 3)).toBe(4);
    expect(droppableLane([block], 'x', 6, 3)).toBe(2);
  });

  it('leaves a lane outside any block alone', () => {
    expect(droppableLane([block], 'x', 0, 1)).toBe(1);
    expect(droppableLane([block], 'x', 0, 5)).toBe(5);
  });

  it('keeps group clips together when a clip is dropped past the block', () => {
    const lanes = [['x'], ['a'], ['b'], ['y']];
    const blocks: GroupBlock[] = [{ groupId: 'g', color: '', firstLane: 1, laneCount: 2, collapsed: false, memberIds: ['a', 'b'] }];
    const order = ['cam', 'x', 'a', 'b', 'y'];
    expect(orderForLane(order, lanes, 'x', droppableLane(blocks, 'x', 0, 1))).toEqual(['cam', 'a', 'b', 'x', 'y']);
  });

  it('moves a clip across a collapsed group', () => {
    const lanes = [['x'], ['a', 'b'], ['y']];
    const blocks: GroupBlock[] = [{ groupId: 'g', color: '', firstLane: 1, laneCount: 1, collapsed: true, memberIds: ['a', 'b'] }];
    expect(orderForLane(['cam', 'x', 'a', 'b', 'y'], lanes, 'x', droppableLane(blocks, 'x', 0, 1))).toEqual(['cam', 'a', 'b', 'x', 'y']);
  });
});

describe('grouping in the store', () => {
  beforeEach(() => setClips(clip('a'), clip('x'), clip('b')));

  it('groups the clips, gives a colour and puts them side by side', () => {
    act(() => state().groupItems(['b', 'a']));
    const [made] = Object.values(state().groups);
    expect(made.itemIds).toEqual(['a', 'b']);
    expect(made.color).toBe(GROUP_COLORS[0]);
    expect(state().itemOrder).toEqual([CAMERA_TRACK_ID, 'a', 'b', 'x']);
  });

  it('needs two clips and never takes the camera', () => {
    act(() => state().groupItems(['a']));
    act(() => state().groupItems(['a', CAMERA_TRACK_ID]));
    expect(state().groups).toEqual({});
  });

  it('does nothing when the clips already are exactly that group', () => {
    act(() => state().groupItems(['a', 'b']));
    const before = state().groups;
    act(() => state().groupItems(['a', 'b']));
    expect(state().groups).toBe(before);
  });

  it('moves a clip out of its old group, dissolving what is left too small', () => {
    act(() => state().groupItems(['a', 'b']));
    act(() => state().groupItems(['b', 'x']));
    expect(Object.values(state().groups).map((g) => g.itemIds)).toEqual([['b', 'x']]);
  });

  it('undoes grouping, order included, in one step', () => {
    act(() => state().groupItems(['a', 'b']));
    act(() => { undo(); });
    expect(state().groups).toEqual({});
    expect(state().itemOrder).toEqual([CAMERA_TRACK_ID, 'a', 'x', 'b']);
  });

  it('ungroups every group holding one of the clips', () => {
    act(() => state().groupItems(['a', 'b']));
    act(() => state().ungroupItems(['a']));
    expect(state().groups).toEqual({});
  });

  it('forgets a group when deleting leaves it with one clip', () => {
    act(() => state().groupItems(['a', 'b']));
    act(() => state().removeItems(['a']));
    expect(state().groups).toEqual({});
  });

  it('collapsing is saved but does not make an undo step', () => {
    act(() => state().groupItems(['a', 'b']));
    const [{ id }] = Object.values(state().groups);
    const steps = useProjectStore.temporal.getState().pastStates.length;
    act(() => state().toggleGroupCollapsed(id));
    expect(state().collapsedGroupIds).toEqual([id]);
    expect(useProjectStore.temporal.getState().pastStates.length).toBe(steps);
  });
});

describe('groups in a saved project', () => {
  it('survive saving and loading', () => {
    const project = createProject({
      items: { [CAMERA_TRACK_ID]: { kind: 'camera', id: CAMERA_TRACK_ID, keyframes: [] }, a: clip('a'), b: clip('b') },
      itemOrder: [CAMERA_TRACK_ID, 'a', 'b'],
      groups: { g: group('g', ['a', 'b']) },
      collapsedGroupIds: ['g'],
    });
    const loaded = parseProjectDocument(toProjectDocument(project));
    expect(loaded.groups).toEqual(project.groups);
    expect(loaded.collapsedGroupIds).toEqual(['g']);
  });

  it('default to none in a project saved before groups existed', () => {
    const { groups: _g, collapsedGroupIds: _c, ...older } = toProjectDocument(createProject());
    const loaded = parseProjectDocument(older);
    expect(loaded.groups).toEqual({});
    expect(loaded.collapsedGroupIds).toEqual([]);
  });

  it('drop a collapsed id whose group could not stand', () => {
    const loaded = parseProjectDocument({
      ...toProjectDocument(createProject()),
      groups: { g: group('g', ['missing', 'missing2']) },
      collapsedGroupIds: ['g'],
    });
    expect(loaded.groups).toEqual({});
    expect(loaded.collapsedGroupIds).toEqual([]);
  });
});

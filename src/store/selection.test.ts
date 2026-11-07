import { beforeEach, describe, expect, it } from 'vitest';
import { CAMERA_TRACK_ID, createTransientState, useProjectStore } from './useProjectStore';
import { selectionOf } from './selection';
import { undo, clearHistory, getHistoryEntries } from './history';
import type { RouteItem } from './types';

const state = () => useProjectStore.getState();

function route(id: string, startTime = 0, endTime = 2): RouteItem {
  return {
    kind: 'route', id, name: id, geojson: { type: 'FeatureCollection', features: [] }, startTime, endTime,
    style: { color: '#000000', width: 4, glow: false, glowWidth: 0, dashPattern: null, animationType: 'draw', cometTrailLength: 0.2 },
    easing: 'linear', exitAnimation: 'none',
  };
}

beforeEach(() => {
  useProjectStore.setState({
    ...createTransientState(),
    duration: 10,
    items: { [CAMERA_TRACK_ID]: { kind: 'camera', id: CAMERA_TRACK_ID, keyframes: [] }, a: route('a'), b: route('b', 3, 5), c: route('c', 6, 8) },
    itemOrder: [CAMERA_TRACK_ID, 'a', 'b', 'c'],
  });
  clearHistory();
});

describe('selectionOf', () => {
  it('names the one item being edited only while exactly one is selected', () => {
    expect(selectionOf([])).toEqual({ selectedItemIds: [], selectedItemId: null });
    expect(selectionOf(['a'])).toEqual({ selectedItemIds: ['a'], selectedItemId: 'a' });
    expect(selectionOf(['a', 'b'])).toEqual({ selectedItemIds: ['a', 'b'], selectedItemId: null });
  });
});

describe('selecting several items', () => {
  it('adds an item to the selection and takes it out again', () => {
    state().selectItem('a');
    state().toggleItemSelection('b');
    expect(state().selectedItemIds).toEqual(['a', 'b']);
    expect(state().selectedItemId).toBeNull();

    state().toggleItemSelection('a');
    expect(state().selectedItemIds).toEqual(['b']);
    expect(state().selectedItemId).toBe('b');
  });

  it('starts a selection from nothing, and leaves the playhead where it is', () => {
    state().toggleItemSelection('c');
    expect(state().selectedItemIds).toEqual(['c']);
    expect(state().playheadTime).toBe(0);
  });

  it('never makes the camera one of several', () => {
    state().selectItem(CAMERA_TRACK_ID);
    state().toggleItemSelection('a');
    expect(state().selectedItemIds).toEqual(['a']);

    state().toggleItemSelection(CAMERA_TRACK_ID);
    expect(state().selectedItemIds).toEqual(['a']);
  });

  it('ignores ids that are not items', () => {
    state().toggleItemSelection('missing');
    expect(state().selectedItemIds).toEqual([]);
  });

  it('a plain selection replaces several, and null clears them', () => {
    state().selectItem('a');
    state().toggleItemSelection('b');
    state().selectItem('c');
    expect(state().selectedItemIds).toEqual(['c']);
    state().selectItem(null);
    expect(state().selectedItemIds).toEqual([]);
  });
});

describe('removeItems', () => {
  it('removes every item in one undo step and drops them from the selection', () => {
    state().selectItem('a');
    state().toggleItemSelection('b');
    state().toggleItemSelection('c');
    state().removeItems(['a', 'b']);

    expect(state().itemOrder).toEqual([CAMERA_TRACK_ID, 'c']);
    expect(Object.keys(state().items).sort()).toEqual([CAMERA_TRACK_ID, 'c'].sort());
    expect(state().selectedItemIds).toEqual(['c']);
    expect(state().selectedItemId).toBe('c');

    expect(getHistoryEntries().past.at(-1)?.label).toBe('Deleted 2 items');

    undo();
    expect(state().itemOrder).toEqual([CAMERA_TRACK_ID, 'a', 'b', 'c']);
  });

  it('frees camera views that followed a removed route', () => {
    useProjectStore.setState({
      items: {
        ...state().items,
        [CAMERA_TRACK_ID]: {
          kind: 'camera', id: CAMERA_TRACK_ID,
          keyframes: [{ id: 'k', time: 1, camera: { center: [0, 0], zoom: 1, pitch: 0, bearing: 0, altitude: null }, easing: 'linear', followRoute: 'b' }],
        },
      },
    });
    state().removeItems(['a', 'b']);
    const camera = state().items[CAMERA_TRACK_ID];
    expect(camera.kind === 'camera' && camera.keyframes[0].followRoute).toBeNull();
  });

  it('removeItem is the same for one', () => {
    state().removeItem('a');
    expect(state().itemOrder).toEqual([CAMERA_TRACK_ID, 'b', 'c']);
  });
});

describe('updateItems', () => {
  it('changes several items in one write and one undo step', () => {
    let writes = 0;
    const unsubscribe = useProjectStore.subscribe((s, previous) => { if (s.items !== previous.items) writes++; });
    state().updateItems({ a: { startTime: 1, endTime: 3 }, b: { startTime: 4, endTime: 6 }, missing: { startTime: 9 } });
    unsubscribe();

    expect(writes).toBe(1);
    expect(state().items.a).toMatchObject({ startTime: 1, endTime: 3 });
    expect(state().items.b).toMatchObject({ startTime: 4, endTime: 6 });
    expect(state().items.missing).toBeUndefined();
    undo();
    expect(state().items.a).toMatchObject({ startTime: 0, endTime: 2 });
  });
});

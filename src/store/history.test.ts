import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProjectStore, CAMERA_TRACK_ID, createTransientState } from './useProjectStore';
import { createProject, toProjectDocument } from './projectDocument';
import {
  HISTORY_EXCLUDED_PROJECT_KEYS,
  PROJECT_KEYS_CLASSIFIED,
  TRACKED_PROJECT_KEYS,
} from './historyKeys';
import {
  HISTORY_LIMIT,
  beginGesture,
  clearHistory,
  endGesture,
  getHistoryEntries,
  installGestureTracking,
  redo,
  undo,
  useHistoryControls,
  withHistoryLabel,
  withHistorySource,
  withoutHistory,
} from './history';
import type { BoundaryItem, CalloutItem, CameraKeyframe, RouteItem } from './types';

const temporal = () => useProjectStore.temporal.getState();
const past = () => temporal().pastStates.length;
const future = () => temporal().futureStates.length;
const state = () => useProjectStore.getState();

function route(id: string, name = `Route ${id}`): RouteItem {
  return {
    kind: 'route', id, name, startTime: 0, endTime: 5,
    geojson: { type: 'FeatureCollection', features: [] },
    style: {
      color: '#3b82f6', width: 4, glow: true, glowColor: '#3b82f6', glowWidth: 12,
      trailFade: false, trailFadeLength: 0.2, dashPattern: null,
    },
    easing: 'linear',
  };
}

function boundary(id: string, placeName = 'Paris'): BoundaryItem {
  return {
    kind: 'boundary', id, placeName, geojson: { type: 'Point', coordinates: [0, 0] },
    resolveStatus: 'resolved', startTime: 0, endTime: 5,
    style: {
      strokeColor: '#fff', fillColor: '#fff', strokeWidth: 2, glow: false, fillOpacity: 0.2,
      animateStroke: false, animationStyle: 'draw', traceLength: 0.1,
    },
    easing: 'linear',
  };
}

function keyframe(id: string, time: number): CameraKeyframe {
  return {
    id, time, easing: 'linear', followRoute: null,
    camera: { center: [0, 0], zoom: 3, pitch: 0, bearing: 0, altitude: null },
  };
}

function resetStore() {
  useProjectStore.setState({ ...createProject(), ...createTransientState() });
  clearHistory();
}

beforeEach(resetStore);

describe('tracked fields', () => {
  it('classifies every Project key as tracked or excluded', () => {
    expect(PROJECT_KEYS_CLASSIFIED).toBe(true);
    const classified = new Set<string>([...TRACKED_PROJECT_KEYS, ...HISTORY_EXCLUDED_PROJECT_KEYS]);
    const { schemaVersion: _v, ...doc } = toProjectDocument(createProject({ customMapStyleUrl: 'x', customMapStyleLabel: 'y' } as never));
    for (const key of Object.keys(doc)) expect(classified.has(key)).toBe(true);
  });

  it('does not record mapCenter changes', () => {
    state().setMapCenter([10, 20]);
    state().setMapCenter([11, 21]);
    expect(past()).toBe(0);
  });

  it('does not record transient UI changes', () => {
    state().setPlayheadTime(3);
    state().selectItem(null);
    state().setIsInspectorOpen(true);
    state().setTerrainLoading(true);
    expect(past()).toBe(0);
  });

  it('records tracked project settings', () => {
    state().setProjection('mercator');
    expect(past()).toBe(1);
    undo();
    expect(state().projection).toBe('globe');
    expect(future()).toBe(1);
  });
});

describe('undo/redo round trips', () => {
  it('adds, updates and removes items', () => {
    state().addItem(route('r1'));
    state().updateItem('r1', { name: 'Renamed' });
    state().removeItem('r1');
    expect(past()).toBe(3);

    undo();
    expect(state().items.r1).toBeDefined();
    expect(state().itemOrder).toContain('r1');
    undo();
    expect((state().items.r1 as RouteItem).name).toBe('Route r1');
    undo();
    expect(state().items.r1).toBeUndefined();

    redo(); redo(); redo();
    expect(state().items.r1).toBeUndefined();
    expect(future()).toBe(0);
  });

  it('a new edit clears the redo stack and its labels', () => {
    state().addItem(route('r1'));
    undo();
    expect(future()).toBe(1);
    state().addItem(route('r2'));
    expect(future()).toBe(0);
    expect(getHistoryEntries().future).toHaveLength(0);
  });

  it('updates to an item removed by undo are harmless', () => {
    state().addItem(route('r1'));
    undo();
    expect(() => state().updateItem('r1', { name: 'late' })).not.toThrow();
    expect(state().items.r1).toBeUndefined();
    expect(past()).toBe(0);
  });

  it('does nothing on empty stacks', () => {
    expect(undo()).toBe(false);
    expect(redo()).toBe(false);
  });
});

describe('gestures', () => {
  it('coalesces many updates into one step', () => {
    state().addItem(route('r1'));
    clearHistory();
    beginGesture();
    for (let t = 1; t <= 50; t++) state().updateItem('r1', { startTime: t / 10 });
    expect(past()).toBe(0);
    endGesture();
    expect(past()).toBe(1);
    expect(getHistoryEntries().past).toHaveLength(1);
    expect(getHistoryEntries().past[0].label).toBe('Moved Route r1');
    undo();
    expect((state().items.r1 as RouteItem).startTime).toBe(0);
  });

  it('records nothing when the gesture changed nothing', () => {
    beginGesture();
    state().setMapCenter([5, 5]);
    state().setPlayheadTime(2);
    endGesture();
    expect(past()).toBe(0);
  });

  it('is re-entrancy safe', () => {
    endGesture(); // without begin: no-op
    beginGesture();
    beginGesture(); // double begin: no-op
    state().setProjection('mercator');
    endGesture();
    endGesture();
    expect(past()).toBe(1);
    state().setLightPreset('night'); // recording resumed
    expect(past()).toBe(2);
  });

  it('gesture end clears redo and respects the limit', () => {
    state().setProjection('mercator');
    undo();
    expect(future()).toBe(1);
    beginGesture();
    state().setLightPreset('dusk');
    endGesture();
    expect(future()).toBe(0);
    expect(getHistoryEntries().future).toHaveLength(0);
  });

  it('blocks undo while a gesture is active', () => {
    state().setProjection('mercator');
    beginGesture();
    expect(undo()).toBe(false);
    endGesture();
    expect(undo()).toBe(true);
  });

  it('document pointer events drive gestures', () => {
    const dispose = installGestureTracking();
    state().addItem(route('r1'));
    clearHistory();
    document.dispatchEvent(new Event('pointerdown'));
    state().updateItem('r1', { startTime: 1 });
    state().updateItem('r1', { startTime: 2 });
    document.dispatchEvent(new Event('pointerup'));
    expect(past()).toBe(1);

    // A click's state change lands after pointerup and is its own step.
    document.dispatchEvent(new Event('pointerdown'));
    document.dispatchEvent(new Event('pointerup'));
    state().setProjection('mercator');
    expect(past()).toBe(2);

    document.dispatchEvent(new Event('pointerdown'));
    state().setLightPreset('night');
    document.dispatchEvent(new Event('pointercancel'));
    expect(past()).toBe(3);

    document.dispatchEvent(new Event('pointerdown'));
    state().setLightPreset('dawn');
    window.dispatchEvent(new Event('blur'));
    expect(past()).toBe(4);
    dispose();
  });
});

describe('withoutHistory', () => {
  it('suppresses steps and nests', () => {
    withoutHistory(() => {
      withoutHistory(() => state().setProjection('mercator'));
      state().setLightPreset('night');
    });
    expect(past()).toBe(0);
    state().setLightPreset('dusk');
    expect(past()).toBe(1);
  });

  it('resumes after a throw', () => {
    expect(() => withoutHistory(() => { throw new Error('x'); })).toThrow();
    state().setProjection('mercator');
    expect(past()).toBe(1);
  });

  it('background writes made during a gesture do not end recording early', () => {
    beginGesture();
    withoutHistory(() => state().setLightPreset('night'));
    state().setProjection('mercator');
    endGesture();
    expect(past()).toBe(1);
  });
});

describe('labels and sources', () => {
  it('derives labels from the change', () => {
    state().addItem(route('r1'));
    state().addItem(boundary('b1', 'Paris'));
    state().updateItem('b1', { placeName: 'Lyon' });
    state().updateItem(CAMERA_TRACK_ID, { keyframes: [keyframe('k1', 1)] });
    state().updateItem(CAMERA_TRACK_ID, { keyframes: [keyframe('k1', 2)] });
    state().setMapStyle('satellite');
    state().setAspectRatio('1:1');
    state().removeItem('b1');
    expect(getHistoryEntries().past.map((e) => e.label)).toEqual([
      'Added route',
      'Added boundary',
      'Edited Lyon boundary',
      'Added camera keyframe',
      'Moved camera keyframe',
      'Changed map style',
      'Changed resolution',
      'Deleted Lyon',
    ]);
  });

  it('labels callout deletion by title', () => {
    const callout = {
      kind: 'callout', id: 'c1', startTime: 0, endTime: 3, content: { title: 'Callout 2' },
    } as unknown as CalloutItem;
    state().addItem(callout);
    state().removeItem('c1');
    expect(getHistoryEntries().past[1].label).toBe('Deleted Callout 2');
  });

  it('defaults source to user and supports ai tagging and label override', () => {
    state().setProjection('mercator');
    withHistorySource('ai', () => {
      withHistorySource('user', () => state().setLightPreset('night'));
      withHistoryLabel('AI: moody', () => state().setLightPreset('dusk'));
    });
    const { past: entries } = getHistoryEntries();
    expect(entries.map((e) => e.source)).toEqual(['user', 'user', 'ai']);
    expect(entries[2].label).toBe('AI: moody');
  });

  it('stays aligned with the state stacks through undo/redo', () => {
    state().setProjection('mercator');
    withHistorySource('ai', () => state().setLightPreset('night'));
    const labels = () => getHistoryEntries();

    const total = past();
    undo();
    expect(labels().past).toHaveLength(total - 1);
    expect(labels().future).toHaveLength(1);
    undo();
    expect(labels().future.map((e) => e.source)).toEqual(['ai', 'user']);
    redo();
    expect(labels().past.map((e) => e.source)).toEqual(['user']);
    expect(labels().past).toHaveLength(past());
    expect(labels().future).toHaveLength(future());
  });

  it('stays aligned when the limit trims old entries', () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      useProjectStore.setState({ starIntensity: i + 1 });
    }
    expect(past()).toBe(HISTORY_LIMIT);
    expect(getHistoryEntries().past).toHaveLength(HISTORY_LIMIT);

    beginGesture();
    useProjectStore.setState({ starIntensity: 999 });
    endGesture();
    expect(past()).toBe(HISTORY_LIMIT);
    expect(getHistoryEntries().past).toHaveLength(HISTORY_LIMIT);

    undo();
    expect(getHistoryEntries().past).toHaveLength(HISTORY_LIMIT - 1);
    expect(getHistoryEntries().future).toHaveLength(1);
  });

  it('keeps stacks aligned when temporal.undo is called directly', () => {
    state().setProjection('mercator');
    temporal().undo();
    expect(getHistoryEntries().past).toHaveLength(0);
    expect(getHistoryEntries().future).toHaveLength(1);
  });
});

describe('lifecycle', () => {
  it('loadFullProject clears history and leaves no load step', () => {
    state().addItem(route('r1'));
    undo();
    state().addItem(route('r2'));
    state().loadFullProject(toProjectDocument(createProject({ name: 'Loaded' })));
    expect(state().name).toBe('Loaded');
    expect(past()).toBe(0);
    expect(future()).toBe(0);
    expect(getHistoryEntries()).toEqual({ past: [], future: [] });
    expect(undo()).toBe(false);
  });
});

describe('selection cleanup and blocking', () => {
  it('clears selection pointing at things undo removed', () => {
    state().addItem(route('r1'));
    state().updateItem(CAMERA_TRACK_ID, { keyframes: [keyframe('k1', 1)] });
    useProjectStore.setState({
      selectedItemId: 'r1', selectedKeyframeId: 'k1', selectedAutoCamRouteId: 'r1',
      activePicker: { id: 'p', ownerId: 'r1', onPick: () => {} },
    });
    undo(); // keyframe gone
    expect(state().selectedKeyframeId).toBeNull();
    expect(state().selectedItemId).toBe('r1');
    undo(); // route gone
    expect(state().selectedItemId).toBeNull();
    expect(state().selectedAutoCamRouteId).toBeNull();
    expect(state().activePicker).toBeNull();
  });

  it('keeps valid selection', () => {
    state().addItem(route('r1'));
    state().updateItem('r1', { name: 'B' });
    useProjectStore.setState({ selectedItemId: 'r1' });
    undo();
    expect(state().selectedItemId).toBe('r1');
  });

  it('marks boundaries with geometry as resolved after undo', () => {
    state().addItem(boundary('b1'));
    withoutHistory(() => state().updateItem('b1', { resolveStatus: 'idle' }));
    state().updateItem('b1', { placeName: 'Lyon' });
    undo();
    expect((state().items.b1 as BoundaryItem).resolveStatus).toBe('resolved');
  });

  it('blocks undo and redo while exporting', () => {
    state().setProjection('mercator');
    useProjectStore.setState({ isExporting: true });
    expect(undo()).toBe(false);
    expect(state().projection).toBe('mercator');
    useProjectStore.setState({ isExporting: false });
    expect(undo()).toBe(true);
    useProjectStore.setState({ isExporting: true });
    expect(redo()).toBe(false);
  });
});

describe('useHistoryControls', () => {
  it('exposes availability and labels, not affected by playback', () => {
    const { result } = renderHook(() => useHistoryControls());
    expect(result.current).toMatchObject({ canUndo: false, canRedo: false, undoLabel: null });
    act(() => state().addItem(route('r1')));
    expect(result.current).toMatchObject({ canUndo: true, canRedo: false, undoLabel: 'Added route' });
    act(() => { undo(); });
    expect(result.current).toMatchObject({ canUndo: false, canRedo: true, redoLabel: 'Added route' });
  });
});

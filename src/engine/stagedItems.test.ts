import { beforeEach, describe, expect, it } from 'vitest';
import { createBoundaryItem, createCalloutItem } from '@/store/itemFactories';
import { useProjectStore } from '@/store/useProjectStore';
import { clearHistory, getHistoryEntries, undo } from '@/store/history';
import '@/annotations/styles';
import { sceneItems, stagedAt, stagedItemsOf } from './stagedItems';

const boundary = { ...createBoundaryItem({ placeName: 'A', geojson: null, startTime: 2 }), endTime: 6 };
const label = createCalloutItem({ styleId: 'map-label', content: { title: 'A' }, lngLat: [0, 0], startTime: 3, endTime: 6 })!;
const existing = createBoundaryItem({ placeName: 'B', geojson: null, startTime: 0 });

const view = { isExporting: false, isCapturingViewport: false, hideUI: false };
const project = { items: { [existing.id]: existing }, itemOrder: [existing.id] };

describe('sceneItems', () => {
  it("is the project's own items and order when nothing is staged", () => {
    const scene = sceneItems({ ...project, ...view, stagedItems: [] });
    expect(scene.items).toBe(project.items);
    expect(scene.itemOrder).toBe(project.itemOrder);
    expect(scene.staged.size).toBe(0);
  });

  it('puts staged items after the project ones, and gives the same objects for the same inputs', () => {
    const stagedItems = [boundary, label];
    const scene = sceneItems({ ...project, ...view, stagedItems });
    expect(scene.itemOrder).toEqual([existing.id, boundary.id, label.id]);
    expect(scene.items[label.id]).toBe(label);
    expect([...scene.staged]).toEqual([boundary.id, label.id]);
    expect(sceneItems({ ...project, ...view, stagedItems })).toBe(scene);
  });

  it('leaves staged items out while exporting or capturing, and with the UI hidden', () => {
    for (const flag of ['isExporting', 'isCapturingViewport', 'hideUI'] as const) {
      expect(sceneItems({ ...project, ...view, [flag]: true, stagedItems: [boundary] }).items).toBe(project.items);
    }
  });
});

describe('stagedAt', () => {
  it('moves staged items so the first starts at the time, keeping their spacing', () => {
    const [b, l] = stagedAt([boundary, label], 10);
    expect([b.startTime, b.endTime]).toEqual([10, 14]);
    expect([l.startTime, l.endTime]).toEqual([11, 14]);
  });
});

describe('addStagedItems', () => {
  beforeEach(() => {
    useProjectStore.setState({ ...project, stagedItems: [], stagedBy: null, playheadTime: 0 });
    clearHistory();
  });

  it('adds the staged items at the playhead as one undo step and clears them', () => {
    useProjectStore.getState().stageItems('boundary-add', [boundary, label]);
    expect(getHistoryEntries().past).toHaveLength(0);
    useProjectStore.setState({ playheadTime: 8 });

    const added = useProjectStore.getState().addStagedItems('boundary-add');

    const state = useProjectStore.getState();
    expect(state.stagedItems).toEqual([]);
    expect(state.itemOrder).toEqual([existing.id, boundary.id, label.id]);
    expect(state.items[boundary.id]).toMatchObject({ startTime: 8, endTime: 12 });
    expect(added.map((item) => item.id)).toEqual([boundary.id, label.id]);
    expect(getHistoryEntries().past).toHaveLength(1);

    undo();
    expect(useProjectStore.getState().itemOrder).toEqual([existing.id]);
  });

  it('adds only what the asking panel staged', () => {
    useProjectStore.getState().stageItems('boundary-add', [boundary]);

    expect(useProjectStore.getState().addStagedItems('callout-add')).toEqual([]);
    expect(useProjectStore.getState().itemOrder).toEqual([existing.id]);
    expect(useProjectStore.getState().stagedItems).toEqual([boundary]);
  });
});

describe('clearStagedItems', () => {
  beforeEach(() => useProjectStore.setState({ stagedItems: [], stagedBy: null }));

  it('drops what the panel staged', () => {
    useProjectStore.getState().stageItems('callout-add', [label]);
    useProjectStore.getState().clearStagedItems('callout-add');
    expect(useProjectStore.getState()).toMatchObject({ stagedItems: [], stagedBy: null });
  });

  it('leaves another panel\'s staged items alone', () => {
    useProjectStore.getState().stageItems('boundary-add', [boundary]);
    useProjectStore.getState().clearStagedItems('callout-add');
    expect(useProjectStore.getState()).toMatchObject({ stagedItems: [boundary], stagedBy: 'boundary-add' });
    expect(stagedItemsOf(useProjectStore.getState(), 'callout-add')).toEqual([]);
  });
});

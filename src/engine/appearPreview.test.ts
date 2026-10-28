import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TimelineItem } from '@/store/types';
import { createBoundaryItem, createCalloutItem } from '@/store/itemFactories';
import { useProjectStore } from '@/store/useProjectStore';
import '@/annotations/styles';
import { activeAppearPreview, APPEAR_PREVIEW_TIMING, appearPreviewProgress, entranceEnd, type AppearPreview } from './appearPreview';

const { playMs, holdMs, plays } = APPEAR_PREVIEW_TIMING;
const loopMs = playMs + holdMs;

describe('appearPreviewProgress', () => {
  it('plays the entrance, holds it finished, and plays it again', () => {
    expect(appearPreviewProgress(0)).toEqual({ progress: 0, done: false });
    expect(appearPreviewProgress(playMs / 2)).toEqual({ progress: 0.5, done: false });
    expect(appearPreviewProgress(playMs + holdMs / 2)).toEqual({ progress: 1, done: false });
    expect(appearPreviewProgress(loopMs + playMs / 4)).toEqual({ progress: 0.25, done: false });
  });

  it('stops finished after the last play, with no hold after it', () => {
    const lastPlayEnds = plays * loopMs - holdMs;
    expect(appearPreviewProgress(lastPlayEnds - 1).done).toBe(false);
    expect(appearPreviewProgress(lastPlayEnds)).toEqual({ progress: 1, done: true });
    expect(appearPreviewProgress(Infinity)).toEqual({ progress: 1, done: true });
  });
});

describe('entranceEnd', () => {
  it('is the end of the clip for a boundary, and the end of the enter transition for a callout', () => {
    const boundary = createBoundaryItem({ placeName: 'A', geojson: null, startTime: 2 });
    expect(entranceEnd(boundary)).toBe(boundary.endTime);
    const callout = createCalloutItem({ styleId: 'map-label', content: { title: 'A' }, lngLat: [0, 0], startTime: 2 })!;
    expect(entranceEnd(callout)).toBe(2 + callout.transition.enterDuration);
  });
});

describe('activeAppearPreview', () => {
  const boundary = { ...createBoundaryItem({ placeName: 'A', geojson: null, startTime: 2 }), endTime: 6 };
  const later = { ...createBoundaryItem({ placeName: 'B', geojson: null, startTime: 4 }), endTime: 10 };
  const items: Record<string, TimelineItem> = { [boundary.id]: boundary, [later.id]: later };
  const preview: AppearPreview = { itemIds: [boundary.id], startedAt: 1000, selectedItemId: boundary.id, playheadTime: 2 };
  const state = {
    appearPreview: preview, items, itemOrder: [boundary.id, later.id], selectedItemId: boundary.id, playheadTime: 2,
    isPlaying: false, isExporting: false, hideUI: false, isCapturingViewport: false, stagedItems: [],
  };

  it('draws its items through their entrance on its own clock', () => {
    expect(activeAppearPreview(state, 1000 + playMs / 2)).toEqual({ itemIds: new Set([boundary.id]), time: 4, done: false });
  });

  it('plays the span of all its items, so later ones keep their stagger', () => {
    const both = { ...state, appearPreview: { ...preview, itemIds: [boundary.id, later.id] } };
    expect(activeAppearPreview(both, 1000 + playMs / 2)?.time).toBe(6);
  });

  it('ends when the selection or the playhead moves, or on play, export or hidden UI', () => {
    const at = 1000 + playMs / 2;
    expect(activeAppearPreview({ ...state, selectedItemId: null }, at)).toBeNull();
    expect(activeAppearPreview({ ...state, playheadTime: 3 }, at)).toBeNull();
    expect(activeAppearPreview({ ...state, isPlaying: true }, at)).toBeNull();
    expect(activeAppearPreview({ ...state, isExporting: true }, at)).toBeNull();
    expect(activeAppearPreview({ ...state, hideUI: true }, at)).toBeNull();
  });

  it('plays staged items, which are not in the project', () => {
    const staged = { ...state, items: {}, itemOrder: [], stagedItems: [boundary] };
    expect(activeAppearPreview(staged, 1000 + playMs / 2)).toEqual({ itemIds: new Set([boundary.id]), time: 4, done: false });
  });

  it('ends when its items are gone (undone)', () => {
    expect(activeAppearPreview({ ...state, items: {} }, 1000)).toBeNull();
  });
});

describe('playAppearPreview', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const stubReducedMotion = (matches: boolean) =>
    vi.stubGlobal('matchMedia', (query: string) => ({ matches, media: query, addEventListener() {}, removeEventListener() {} }));

  it('starts now, with the selection and playhead as they are', () => {
    stubReducedMotion(false);
    vi.spyOn(performance, 'now').mockReturnValue(500);
    useProjectStore.setState({ selectedItemId: 'a', playheadTime: 3 });
    useProjectStore.getState().playAppearPreview(['a', 'b']);
    expect(useProjectStore.getState().appearPreview).toEqual({ itemIds: ['a', 'b'], startedAt: 500, selectedItemId: 'a', playheadTime: 3 });
  });

  it('starts finished when the user asks for less motion', () => {
    stubReducedMotion(true);
    useProjectStore.getState().playAppearPreview(['a']);
    expect(appearPreviewProgress(performance.now() - useProjectStore.getState().appearPreview!.startedAt).done).toBe(true);
  });
});

import { render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import TimelinePanel from '@/components/Timeline/TimelinePanel';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { clearHistory, getHistoryEntries, installGestureTracking } from '@/store/history';
import { hasTiming, planDemo, applyStep, type DemoStep } from './plan';
import { runStep } from './runners';
import { dragClipsToFile, planClipDrags } from './timelineRunner';
import { startingProject } from './startState';
import { testContext } from './testContext';
import { demoFixture } from './testFixture';

vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: null }) }));
vi.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isMobile: false, isTablet: false }) }));

const file = demoFixture();
const steps = planDemo(file);
const timeline = steps.find((s): s is Extract<DemoStep, { kind: 'timeline' }> => s.kind === 'timeline')!;
const clipIds = ['b-spain', 'b-france', 'r-paris-lyon', 'c-paris', 'mi-tower'];

const timingOf = (id: string) => {
  const item = useProjectStore.getState().items[id];
  return item && hasTiming(item) ? { startTime: item.startTime, endTime: item.endTime } : null;
};

let stopGestures: () => void;
let rects: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  stopGestures = installGestureTracking();
  // jsdom has no layout: a box is where its inline style puts it, which is all the timeline's clips and ruler need.
  rects = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const style = (this as HTMLElement).style;
    const px = (value: string) => parseFloat(value) || 0;
    const left = px(style?.left);
    const top = px(style?.top);
    const width = px(style?.width);
    const height = px(style?.height);
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
  });
  // The project after the steps before the timeline: every clip where the UI put it.
  const placed = steps.slice(0, steps.indexOf(timeline)).reduce((p, s) => applyStep(p, s, file), startingProject(file));
  useProjectStore.setState({ ...placed, ...createTransientState(), isInspectorOpen: false });
  clearHistory();
});

afterEach(() => {
  stopGestures();
  rects.mockRestore();
});

describe('planClipDrags', () => {
  const live = { startTime: 0, endTime: 5 };

  it('moves a clip whose edges shift alike, trims the one edge that differs', () => {
    expect(planClipDrags(live, { startTime: 10, endTime: 15 }, 45)).toEqual([{ edge: 'move', seconds: 10 }]);
    expect(planClipDrags(live, { startTime: 0, endTime: 9 }, 45)).toEqual([{ edge: 'end', seconds: 4 }]);
    expect(planClipDrags({ startTime: 2, endTime: 5 }, { startTime: 1, endTime: 5 }, 45)).toEqual([{ edge: 'start', seconds: -1 }]);
    expect(planClipDrags(live, live, 45)).toEqual([]);
  });

  it('moves to the new start, then trims the end, when both edges differ', () => {
    expect(planClipDrags(live, { startTime: 1.5, endTime: 9 }, 45)).toEqual([
      { edge: 'move', seconds: 1.5 },
      { edge: 'end', seconds: 2.5 },
    ]);
  });

  it('trims both edges, the end first, when the move would run past the end', () => {
    // 40 + 5 is past a 42 s video: the end edge goes out first, then the start follows.
    expect(planClipDrags(live, { startTime: 40, endTime: 42 }, 42)).toEqual([
      { edge: 'end', seconds: 37 },
      { edge: 'start', seconds: 40 },
    ]);
  });
});

describe('timeline runner', () => {
  it('drags each clip in the real timeline to the file’s timing, then writes it exactly', async () => {
    render(<TimelinePanel />);
    const before = Object.fromEntries(clipIds.map((id) => [id, timingOf(id)]));
    expect(before['b-spain']).toMatchObject({ startTime: 0 });

    // Every change to a clip's timing the drags make.
    const writes: string[] = [];
    const unsubscribe = useProjectStore.subscribe((s, prev) => {
      for (const id of clipIds) if (s.items[id] !== prev.items[id]) writes.push(id);
    });
    const ctx = testContext();
    await dragClipsToFile(ctx, file);
    unsubscribe();

    // Dragged by the mouse: every clip that had to move is within a snap of its place (8 px at 60 px/s).
    for (const id of clipIds) {
      const target = timingOf(id)!;
      const want = hasTiming(file.items[id]) ? file.items[id] : null;
      expect(want).not.toBeNull();
      expect(Math.abs(target.startTime - want!.startTime)).toBeLessThan(0.15);
      expect(Math.abs(target.endTime - want!.endTime)).toBeLessThan(0.15);
    }
    expect(new Set(writes)).toEqual(new Set(clipIds));
    // Each drag is a user's undo step.
    expect(getHistoryEntries().past.length).toBeGreaterThanOrEqual(clipIds.length);
    expect(getHistoryEntries().past.every((entry) => entry.source === 'user')).toBe(true);

    await runStep(ctx, timeline, file);
    for (const id of clipIds) expect(useProjectStore.getState().items[id]).toEqual(file.items[id]);
  }, 30_000);

  it('still ends on the file’s timing when there is no timeline to drag in', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await runStep(testContext(), timeline, file);
    for (const id of clipIds) expect(useProjectStore.getState().items[id]).toEqual(file.items[id]);
    warn.mockRestore();
  }, 15_000);
});

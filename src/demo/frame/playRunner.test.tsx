import { render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import TimelinePanel from '@/components/Timeline/TimelinePanel';
import { usePlayback } from '@/hooks/usePlayback';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { isDemoAborted } from './clock';
import type { DemoStep } from './plan';
import { runStep } from './runners';
import { startingProject } from './startState';
import { testContext } from './testContext';
import { demoFixture } from './testFixture';

vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: null }) }));
vi.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isMobile: false, isTablet: false }) }));

const file = demoFixture();
const step: DemoStep = { kind: 'play', label: 'Play' };
/** Shorter than the fixture's, so playing it takes about a second. */
const VIDEO_SECONDS = 1;

/** The editor's own playback: it moves the playhead in real time and stops at the end. */
function Editor() {
  usePlayback({ current: null });
  return <TimelinePanel />;
}

let warn: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  useProjectStore.setState({ ...startingProject(file), ...createTransientState(), duration: VIDEO_SECONDS, playheadTime: 0.4 });
});

afterEach(() => {
  warn.mockRestore();
  useProjectStore.getState().setIsPlaying(false);
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('play runner', () => {
  it('rewinds, clicks Play and waits for the whole video, then leaves playback stopped', async () => {
    render(<Editor />);
    const plays: boolean[] = [];
    const playheads: number[] = [];
    const unsubscribe = useProjectStore.subscribe((s, prev) => {
      if (s.isPlaying !== prev.isPlaying) plays.push(s.isPlaying);
      if (s.playheadTime !== prev.playheadTime) playheads.push(s.playheadTime);
    });
    const started = Date.now();
    await runStep(testContext(), step, file);
    unsubscribe();

    // Jump to Start came first, then Play from 0, and the app stopped playback itself at the end.
    expect(playheads[0]).toBe(0);
    expect(plays).toEqual([true, false]);
    // The run's speed (x1000 here) does not shorten playback: it took the video's own length.
    expect(Date.now() - started).toBeGreaterThanOrEqual(VIDEO_SECONDS * 1000 * 0.9);
    expect(useProjectStore.getState().isPlaying).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  }, 15_000);

  it('holds playback while the run is paused and carries on when it resumes', async () => {
    render(<Editor />);
    const ctx = testContext();
    useProjectStore.setState({ playheadTime: 0 });
    const run = runStep(ctx, step, file);
    while (!useProjectStore.getState().isPlaying) await sleep(10);
    ctx.clock.pause();
    await sleep(300);
    expect(useProjectStore.getState().isPlaying).toBe(false);
    const held = useProjectStore.getState().playheadTime;
    await sleep(200);
    expect(useProjectStore.getState().playheadTime).toBe(held);
    ctx.clock.resume();
    await run;
    expect(useProjectStore.getState().isPlaying).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  }, 15_000);

  it('stops playback when the run is reset', async () => {
    render(<Editor />);
    const ctx = testContext();
    useProjectStore.setState({ playheadTime: 0, duration: 30 });
    const run = runStep(ctx, step, file).catch((error) => error);
    while (!useProjectStore.getState().isPlaying) await sleep(10);
    ctx.clock.cancel();
    expect(isDemoAborted(await run)).toBe(true);
    expect(useProjectStore.getState().isPlaying).toBe(false);
  }, 15_000);
});

import { useProjectStore } from '@/store/useProjectStore';
import type { Project } from '@/store/types';
import { click, find, warn, type DemoContext } from './actions';
import { currentLocators } from './locators';
import type { DemoStep } from './plan';
import { commitStep } from './runners';

/**
 * The play step: the cursor clicks the transport's Jump to Start (when the
 * playhead is not already there) and Play, and the run waits while the project
 * plays. Playback runs on real time, whatever the speed of the run, and stops
 * itself at the end of the video.
 */

/** How often the wait looks at playback, in real ms. */
const TICK_MS = 100;
/** How long past the video's length the wait gives playback before it gives up, in real ms. */
const SLACK_MS = 3000;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Waits for playback to stop on its own. A paused run holds playback too, and
 * a resumed run lets it carry on from where it stopped; a cancelled run stops it.
 */
async function untilPlaybackEnds(ctx: DemoContext, durationSeconds: number): Promise<void> {
  const { setIsPlaying } = useProjectStore.getState();
  const limit = durationSeconds * 1000 + SLACK_MS;
  let heldByPause = false;
  try {
    // Only time spent playing counts towards the limit.
    for (let playedFor = 0; playedFor < limit; ) {
      ctx.clock.check();
      const playing = useProjectStore.getState().isPlaying;
      if (ctx.clock.paused) {
        if (playing) {
          setIsPlaying(false);
          heldByPause = true;
        }
      } else if (heldByPause) {
        heldByPause = false;
        setIsPlaying(true);
      } else if (!playing) {
        return;
      } else {
        playedFor += TICK_MS;
      }
      await realSleep(TICK_MS);
    }
    warn('playback did not stop at the end of the video');
  } finally {
    if (ctx.clock.aborted || useProjectStore.getState().isPlaying) setIsPlaying(false);
  }
}

export async function runPlay(ctx: DemoContext, step: Extract<DemoStep, { kind: 'play' }>, file: Project): Promise<void> {
  const L = currentLocators();
  // No transport on screen: nothing to play, and no reason to wait for it.
  if (!(await find(ctx, L.timelinePlay, { timeout: 1500 }))) {
    commitStep(step, file);
    return;
  }
  if (useProjectStore.getState().playheadTime > 0.005) await click(ctx, L.timelineJumpToStart);
  if (await click(ctx, L.timelinePlay)) await untilPlaybackEnds(ctx, useProjectStore.getState().duration);
  commitStep(step, file);
}

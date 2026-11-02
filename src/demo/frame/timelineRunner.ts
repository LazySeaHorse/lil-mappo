import { useProjectStore } from '@/store/useProjectStore';
import type { Project } from '@/store/types';
import { drag, find, moveTo, pause, warn, type DemoContext } from './actions';
import { currentLocators } from './locators';
import { hasTiming, type DemoStep, type ItemTiming } from './plan';
import { fitSpan, pixelsPerSecond } from './timelineActions';
import { commitStep } from './runners';

/**
 * The timeline step: each clip is dragged, in the real timeline, from the
 * timing the UI gave it to the file's (the whole clip to move it, an edge
 * handle to trim it). The final write makes the times exact, so a drag that
 * snapped to a neighbour or hit a limit still ends on the file.
 */

/** Below this (seconds) two times read the same on the timeline, which shows hundredths. */
const SAME = 0.01;

/** One drag of a clip: the whole clip, or one edge, by this many seconds (negative is earlier). */
export interface ClipDrag {
  edge: 'move' | 'start' | 'end';
  seconds: number;
}

/**
 * The drags that turn the clip `live` into `target`: one move when both edges
 * shift alike, one trim when only an edge differs, and otherwise a move to the
 * new start then a trim of the end (or two trims, end first, when the move
 * would run past the end of the video).
 */
export function planClipDrags(live: ItemTiming, target: ItemTiming, duration: number): ClipDrag[] {
  const ds = target.startTime - live.startTime;
  const de = target.endTime - live.endTime;
  const differs = (seconds: number) => Math.abs(seconds) >= SAME;
  if (!differs(ds) && !differs(de)) return [];
  if (!differs(ds - de)) return [{ edge: 'move', seconds: ds }];
  if (!differs(ds)) return [{ edge: 'end', seconds: de }];
  if (!differs(de)) return [{ edge: 'start', seconds: ds }];
  const length = live.endTime - live.startTime;
  if (target.startTime + length <= duration + SAME) {
    const left = target.endTime - (target.startTime + length);
    return [{ edge: 'move', seconds: ds }, ...(differs(left) ? [{ edge: 'end' as const, seconds: left }] : [])];
  }
  // The end edge goes out first, then the start follows it: the new start is past the old one here, so the clip stays valid.
  return [{ edge: 'end', seconds: de }, { edge: 'start', seconds: ds }];
}

/** Presses the clip (or its edge handle) and drags it sideways by `seconds`, at the lane it is in. */
async function dragClip(ctx: DemoContext, itemId: string, { edge, seconds }: ClipDrag): Promise<boolean> {
  const L = currentLocators();
  const grip = await moveTo(ctx, edge === 'move' ? L.timelineClip(itemId) : L.timelineHandle(itemId, edge));
  if (!grip) return false;
  const from = ctx.cursor.position;
  // Straight along the lane: a drag that drifts up or down would change the clip's lane.
  return drag(ctx, grip, { x: from.x + seconds * pixelsPerSecond(), y: from.y });
}

/** The file's clips that the UI placed elsewhere, in the file's timeline order. */
function clipsToDrag(file: Project): { id: string; target: ItemTiming }[] {
  const items = useProjectStore.getState().items;
  return file.itemOrder.flatMap((id) => {
    const live = items[id];
    const target = file.items[id];
    if (!live || !target || !hasTiming(live) || !hasTiming(target)) return [];
    const moved = Math.abs(live.startTime - target.startTime) >= SAME || Math.abs(live.endTime - target.endTime) >= SAME;
    return moved ? [{ id, target: { startTime: target.startTime, endTime: target.endTime } }] : [];
  });
}

/** The on-screen part of the step: every clip dragged to the file's timing (nearly: snapping decides the last pixels). */
export async function dragClipsToFile(ctx: DemoContext, file: Project): Promise<void> {
  const clips = clipsToDrag(file);
  if (!clips.length) return;
  const L = currentLocators();
  if (!(await find(ctx, L.timelinePanel, { timeout: 1500 }))) return;
  for (const { id, target } of clips) {
    ctx.clock.check();
    const item = useProjectStore.getState().items[id];
    if (!item || !hasTiming(item)) continue;
    // Zoom out (once, if at all) so the clip's old and new places both show, rather than scrolling around.
    await fitSpan(ctx, L, Math.max(item.endTime, target.endTime));
    for (const step of planClipDrags(item, target, useProjectStore.getState().duration)) {
      ctx.clock.check();
      if (!(await dragClip(ctx, id, step))) {
        warn(`could not drag the clip ${id}: written directly`);
        break;
      }
    }
    await pause(ctx, ctx.timing.betweenSteps * 0.3);
  }
}

export async function runTimeline(ctx: DemoContext, step: Extract<DemoStep, { kind: 'timeline' }>, file: Project): Promise<void> {
  await dragClipsToFile(ctx, file);
  commitStep(step, file);
}

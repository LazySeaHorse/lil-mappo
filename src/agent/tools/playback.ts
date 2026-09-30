import { z } from 'zod/v4';
import { defineTool } from '../defineTool';
import { ToolError } from '../errors';
import { getState, timeSchema } from './shared';
import { canRedo, canUndo, getHistoryEntries, redo, undo } from '@/store/history';

export const setPlayhead = defineTool({
  name: 'set_playhead',
  title: 'Set playhead',
  description:
    'Moves the timeline playhead to `time` (seconds, 0 to project duration). The map camera and all items jump to how they look at that moment. ' +
    'Not an undo step and not saved in the project. Useful before adding items (new items default to starting at the playhead). ' +
    'To see what a moment looks like, use render_frames instead. Refused while playback is running.',
  input: z.strictObject({ time: timeSchema.describe('Seconds on the project timeline, 0 to project duration.') }),
  readOnly: false,
  handler: ({ time }) => {
    const s = getState();
    if (s.isPlaying) throw new ToolError('playback_running', 'Playback is running; pause it before moving the playhead.');
    if (time > s.duration) {
      throw new ToolError('time_out_of_range', `time ${time}s is beyond the project duration (${s.duration}s).`, { duration: s.duration });
    }
    s.setPlayheadTime(time);
    return { data: { playheadTime: time, duration: s.duration }, summary: `Playhead moved to ${time}s` };
  },
});

function historyStatus() {
  const { past, future } = getHistoryEntries();
  return {
    canUndo: canUndo(),
    canRedo: canRedo(),
    nextUndo: past.at(-1)?.label ?? null,
    nextRedo: future.at(-1)?.label ?? null,
  };
}

export const undoTool = defineTool({
  name: 'undo',
  title: 'Undo',
  description:
    'Reverts the most recent undoable change to the project, whoever made it (the user or an AI tool call; each tool call is one step). ' +
    'Returns the label of the reverted step and what undo/redo would do next. Fails if there is nothing to undo or the user is mid-drag. Reverse with redo.',
  input: z.strictObject({}),
  readOnly: false,
  handler: () => {
    const reverted = getHistoryEntries().past.at(-1);
    if (!undo()) {
      throw new ToolError('nothing_to_undo', 'Nothing to undo (or the editor is busy exporting / mid-drag).', historyStatus());
    }
    return {
      data: { reverted: reverted ? { label: reverted.label, source: reverted.source } : null, ...historyStatus() },
      summary: `Undid: ${reverted?.label ?? 'last change'}`,
    };
  },
});

export const redoTool = defineTool({
  name: 'redo',
  title: 'Redo',
  description:
    'Re-applies the most recently undone step. Only available right after undo, before any new change. Returns the re-applied step label and the new undo/redo state.',
  input: z.strictObject({}),
  readOnly: false,
  handler: () => {
    const reapplied = getHistoryEntries().future.at(-1);
    if (!redo()) {
      throw new ToolError('nothing_to_redo', 'Nothing to redo (or the editor is busy exporting / mid-drag).', historyStatus());
    }
    return {
      data: { reapplied: reapplied ? { label: reapplied.label, source: reapplied.source } : null, ...historyStatus() },
      summary: `Redid: ${reapplied?.label ?? 'last change'}`,
    };
  },
});

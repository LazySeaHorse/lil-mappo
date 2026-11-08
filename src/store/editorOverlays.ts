import type { TransientProjectState } from './slices/types';

/**
 * Whether the editor draws its own handles on the map (draggable route points, the model handle).
 * They are for editing, so they never show where the map shows the video: while playing,
 * exporting or capturing, nor with the UI hidden, which shows exactly what the video shows.
 */
export function showsEditorOverlays(
  state: Pick<TransientProjectState, 'hideUI' | 'isPlaying' | 'isExporting' | 'isCapturingViewport'>,
): boolean {
  return !state.hideUI && !state.isPlaying && !state.isExporting && !state.isCapturingViewport;
}

interface TimedItem {
  startTime: number;
  endTime: number;
}

/**
 * Whether a selected item is shown outside its animation in the live editor, so
 * it can be edited without scrubbing to it. That is when it is off the playhead:
 * at or before the clip start, where nothing has drawn yet (selecting an item
 * parks the playhead on its start), or after the clip end. Past the start, the
 * real animation shows. Never applies while exporting, so renders match the
 * timeline.
 */
export function isSelectionPreview(
  item: TimedItem,
  playheadTime: number,
  isSelected: boolean,
  isExporting = false,
): boolean {
  if (!isSelected || isExporting) return false;
  return playheadTime <= item.startTime || playheadTime > item.endTime;
}

/**
 * The time to draw a route or boundary at in the live editor: a previewed
 * selection is drawn as at the end of its clip, where it is fully drawn. Callouts
 * are not: at their end the exit has finished, so they draw settled instead (see
 * `isSelectionPreview` and the `settled` frame option).
 */
export function selectionPreviewTime(
  item: TimedItem,
  playheadTime: number,
  isSelected: boolean,
  isExporting = false,
): number {
  return isSelectionPreview(item, playheadTime, isSelected, isExporting) ? item.endTime : playheadTime;
}

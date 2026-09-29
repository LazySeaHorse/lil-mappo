interface TimedItem {
  startTime: number;
  endTime: number;
}

/**
 * The time to draw an item at in the live editor. A selected item that is off the playhead is
 * drawn as at the end of its clip (fully drawn and visible), so it can be edited without
 * scrubbing to it. "Off" means at or before the clip start, where nothing has drawn yet
 * (selecting an item parks the playhead on its start), or after the clip end. Past the start,
 * the real animation shows. Never applies while exporting, so renders match the timeline.
 */
export function selectionPreviewTime(
  item: TimedItem,
  playheadTime: number,
  isSelected: boolean,
  isExporting = false,
): number {
  if (!isSelected || isExporting) return playheadTime;
  return playheadTime <= item.startTime || playheadTime > item.endTime ? item.endTime : playheadTime;
}

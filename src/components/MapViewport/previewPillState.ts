import { isSelectionPreview } from '@/engine/selectionPreview';
import { timelineItemLabel } from '@/components/Timeline/timelineItemLabel';
import type { TimelineItem } from '@/store/types';

export interface SelectionPreviewPillState {
  /** Display name of the previewed item. */
  name: string;
  /** A time inside the clip, where the real animation plays. */
  seekTime: number;
}

interface PillInputs {
  items: Record<string, TimelineItem>;
  selectedItemId: string | null;
  playheadTime: number;
  isExporting: boolean;
  hideUI: boolean;
}

/**
 * What the map's preview pill shows, or null when it is hidden: only for a
 * selected timed item the live map is drawing in full (see `isSelectionPreview`),
 * and never in present mode or while exporting. The seek time is the clip
 * midpoint, which is inside the clip however the item animates.
 */
export function selectionPreviewPillState({
  items,
  selectedItemId,
  playheadTime,
  isExporting,
  hideUI,
}: PillInputs): SelectionPreviewPillState | null {
  if (hideUI || !selectedItemId) return null;
  const item = items[selectedItemId];
  if (!item || item.kind === 'camera') return null;
  if (!isSelectionPreview(item, playheadTime, true, isExporting)) return null;
  return { name: timelineItemLabel(item), seekTime: (item.startTime + item.endTime) / 2 };
}

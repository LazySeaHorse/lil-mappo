import type { TimelineItem } from '@/store/types';
import { CAMERA_VIEW_TERMS } from '@/lib/terms';

/** The name a timeline item goes by in its track row and elsewhere in the UI. */
export function timelineItemLabel(item: TimelineItem): string {
  switch (item.kind) {
    case 'camera': return CAMERA_VIEW_TERMS.track;
    case 'route': return item.name;
    case 'boundary': return item.placeName || 'Boundary';
    case 'callout': return item.content.title || 'Callout';
  }
}

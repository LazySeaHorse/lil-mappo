import type { TimelineItem } from '@/store/types';

/** The name a timeline item goes by in its track row and elsewhere in the UI. */
export function timelineItemLabel(item: TimelineItem): string {
  switch (item.kind) {
    case 'camera': return 'Camera';
    case 'route': return item.name;
    case 'boundary': return item.placeName || 'Boundary';
    case 'callout': return item.content.title || 'Callout';
  }
}

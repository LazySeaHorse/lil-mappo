import { describe, expect, it } from 'vitest';
import { selectionPreviewPillState } from './previewPillState';
import type { BoundaryItem, CameraItem, CalloutItem, RouteItem, TimelineItem } from '@/store/types';

const route = { kind: 'route', id: 'r', name: 'Coast road', startTime: 2, endTime: 6 } as RouteItem;
const boundary = { kind: 'boundary', id: 'b', placeName: '', startTime: 1, endTime: 5 } as BoundaryItem;
const callout = { kind: 'callout', id: 'c', content: { title: 'Hello' }, startTime: 0, endTime: 4 } as CalloutItem;
const camera = { kind: 'camera', id: 'cam', keyframes: [] } as CameraItem;

const items: Record<string, TimelineItem> = Object.fromEntries(
  [route, boundary, callout, camera].map((item) => [item.id, item]),
);

const base = { items, selectedItemId: 'r', playheadTime: 0, isExporting: false, hideUI: false };

describe('selectionPreviewPillState', () => {
  it('names the selected item and seeks to the clip midpoint while it is previewed', () => {
    expect(selectionPreviewPillState(base)).toEqual({ name: 'Coast road', seekTime: 4 });
    expect(selectionPreviewPillState({ ...base, playheadTime: 2 })).not.toBeNull();
    expect(selectionPreviewPillState({ ...base, playheadTime: 9 })).not.toBeNull();
  });

  it('uses the timeline row label, including fallbacks', () => {
    expect(selectionPreviewPillState({ ...base, selectedItemId: 'b' })?.name).toBe('Boundary');
    expect(selectionPreviewPillState({ ...base, selectedItemId: 'c', playheadTime: 5 })?.name).toBe('Hello');
  });

  it('hides while the real animation plays', () => {
    expect(selectionPreviewPillState({ ...base, playheadTime: 3 })).toBeNull();
    expect(selectionPreviewPillState({ ...base, playheadTime: 6 })).toBeNull();
  });

  it('hides without a timed selection', () => {
    expect(selectionPreviewPillState({ ...base, selectedItemId: null })).toBeNull();
    expect(selectionPreviewPillState({ ...base, selectedItemId: 'missing' })).toBeNull();
    expect(selectionPreviewPillState({ ...base, selectedItemId: 'cam' })).toBeNull();
  });

  it('hides in present mode and while exporting', () => {
    expect(selectionPreviewPillState({ ...base, hideUI: true })).toBeNull();
    expect(selectionPreviewPillState({ ...base, isExporting: true })).toBeNull();
  });
});

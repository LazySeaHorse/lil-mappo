import { describe, it, expect } from 'vitest';
import { isSelectionPreview, selectionPreviewTime } from './selectionPreview';

const clip = { startTime: 2, endTime: 6 };

describe('selectionPreviewTime', () => {
  it('leaves unselected items on the playhead', () => {
    expect(selectionPreviewTime(clip, 0, false)).toBe(0);
    expect(selectionPreviewTime(clip, 9, false)).toBe(9);
  });

  it('draws a selected item at its end before the clip starts and after it ends', () => {
    expect(selectionPreviewTime(clip, 0, true)).toBe(6);
    expect(selectionPreviewTime(clip, 9, true)).toBe(6);
  });

  it('treats the clip start as off the playhead, since selecting parks the playhead there', () => {
    expect(selectionPreviewTime(clip, 2, true)).toBe(6);
  });

  it('keeps the real animation while the playhead is inside the clip', () => {
    expect(selectionPreviewTime(clip, 2.01, true)).toBe(2.01);
    expect(selectionPreviewTime(clip, 4, true)).toBe(4);
    expect(selectionPreviewTime(clip, 6, true)).toBe(6);
  });

  it('never overrides while exporting', () => {
    expect(selectionPreviewTime(clip, 0, true, true)).toBe(0);
  });
});

describe('isSelectionPreview', () => {
  it('previews a selected item at or before its start and after its end', () => {
    expect(isSelectionPreview(clip, 0, true)).toBe(true);
    expect(isSelectionPreview(clip, 2, true)).toBe(true);
    expect(isSelectionPreview(clip, 9, true)).toBe(true);
  });

  it('shows the real animation while the playhead is inside the clip', () => {
    expect(isSelectionPreview(clip, 2.01, true)).toBe(false);
    expect(isSelectionPreview(clip, 6, true)).toBe(false);
  });

  it('never previews unselected items or while exporting', () => {
    expect(isSelectionPreview(clip, 0, false)).toBe(false);
    expect(isSelectionPreview(clip, 0, true, true)).toBe(false);
  });
});

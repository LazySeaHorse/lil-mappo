import { describe, expect, it } from 'vitest';
import {
  PANEL_MARGIN,
  RIGHT_RESERVED_DESKTOP,
  RIGHT_RESERVED_TABLET,
  TIMELINE_MIN_HEIGHT,
  rightReserved,
  timelineContentHeight,
  visibleTimelineHeight,
} from './layout';

describe('rightReserved', () => {
  it('reserves only the margin when the inspector is closed or is a drawer', () => {
    expect(rightReserved({ isInspectorOpen: false, isMobile: false, isTablet: false })).toBe(PANEL_MARGIN);
    expect(rightReserved({ isInspectorOpen: true, isMobile: true, isTablet: false })).toBe(PANEL_MARGIN);
  });

  it('reserves the inspector width on desktop and tablet', () => {
    expect(rightReserved({ isInspectorOpen: true, isMobile: false, isTablet: false })).toBe(RIGHT_RESERVED_DESKTOP);
    expect(rightReserved({ isInspectorOpen: true, isMobile: false, isTablet: true })).toBe(RIGHT_RESERVED_TABLET);
  });
});

describe('visibleTimelineHeight', () => {
  it('shrinks a tall dragged height to the tracks the timeline holds', () => {
    expect(visibleTimelineHeight(400, 1)).toBe(timelineContentHeight(1));
  });

  it('keeps a dragged height that fits the tracks', () => {
    expect(visibleTimelineHeight(200, 10)).toBe(200);
  });

  it('never goes below the minimum', () => {
    expect(visibleTimelineHeight(50, 0)).toBe(TIMELINE_MIN_HEIGHT);
  });
});

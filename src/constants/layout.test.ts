import { describe, expect, it } from 'vitest';
import { PANEL_MARGIN, RIGHT_RESERVED_DESKTOP, RIGHT_RESERVED_TABLET, rightReserved } from './layout';

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

/**
 * Centralized layout constants for the application shell.
 * Ensures consistent spacing between floating "island" panels across different device breakpoints.
 */

export const PANEL_MARGIN = 16; // Matches tailwind '4' (1rem) spacing used for 'top-4', 'right-4', etc.
export const PANEL_GAP = 16;    // The desired air-gap between floating panels.

export const INSPECTOR_WIDTH_DESKTOP = 340; // w-[340px]
export const INSPECTOR_WIDTH_TABLET = 300;  // w-[300px]

/**
 * The total horizontal space reserved from the right edge of the screen 
 * when the inspector is open. Includes the panel itself, its margin from 
 * the screen edge, and the air-gap for other floating elements.
 */
export const RIGHT_RESERVED_DESKTOP = INSPECTOR_WIDTH_DESKTOP + PANEL_MARGIN + PANEL_GAP; // 372
export const RIGHT_RESERVED_TABLET = INSPECTOR_WIDTH_TABLET + PANEL_MARGIN + PANEL_GAP;   // 332


export const TIMELINE_HEADER_HEIGHT = 48;
export const TIMELINE_MIN_HEIGHT = 120; // header + ruler + some visible content

/** Tallest the timeline grows: its header, the ruler and one row per track. */
export function timelineContentHeight(trackCount: number): number {
  return TIMELINE_HEADER_HEIGHT + 40 + trackCount * 40 + 16;
}

/**
 * Height the timeline is drawn at. The height the user dragged it to is kept, but the panel
 * shrinks to its tracks, so anything laid out around the timeline must use this one.
 */
export function visibleTimelineHeight(height: number, trackCount: number): number {
  return Math.max(TIMELINE_MIN_HEIGHT, Math.min(height, timelineContentHeight(trackCount)));
}

/**
 * Space to keep clear on the right edge for floating UI that shares the top
 * of the screen with the inspector. Phones show the inspector as a drawer, so
 * it reserves nothing there.
 */
export function rightReserved({
  isInspectorOpen,
  isMobile,
  isTablet,
}: {
  isInspectorOpen: boolean;
  isMobile: boolean;
  isTablet: boolean;
}): number {
  if (!isInspectorOpen || isMobile) return PANEL_MARGIN;
  return isTablet ? RIGHT_RESERVED_TABLET : RIGHT_RESERVED_DESKTOP;
}

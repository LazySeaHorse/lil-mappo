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


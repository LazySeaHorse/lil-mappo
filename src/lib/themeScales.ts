/**
 * Custom Tailwind theme scales. tailwind.config.ts builds the classes from these, and `cn`
 * registers the same keys with tailwind-merge, which otherwise reads `text-micro` as a color
 * and `z-overlay` as an unknown class.
 */

/** Sizes below text-xs. Size only, so they inherit line-height like the rest of a dense row. */
export const fontSizeScale = {
  '2xs': '0.6875rem', // 11px: captions, meta rows, compact labels
  micro: '0.5rem', // 8px: uppercase badge labels only
} as const;

/** App-wide stacking layers, lowest first. Plain z-10/z-20 stay for local stacking inside a component. */
export const zIndexScale = {
  overlay: '50', // Radix dialogs, popovers, menus, tooltips
  'tour-backdrop': '119',
  tour: '120',
  'tour-popover': '130', // popovers that stay usable beside the tour card
  celebration: '200',
} as const;

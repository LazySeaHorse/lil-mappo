/**
 * User-facing words that the toolbar add panels and the inspectors share.
 * Keep one word for one idea, so a user sees the same label everywhere.
 */

/** What each kind of timeline item is called in the inspector header. */
export const ITEM_TYPE_LABELS = {
  route: 'Route',
  callout: 'Callout',
  boundary: 'Area',
  'camera-kf': 'Camera view',
} as const;

export type InspectorItemKind = keyof typeof ITEM_TYPE_LABELS;

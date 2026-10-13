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

/** Labels of the timing fields, shared by every item that has a time range. */
export const TIMING_LABELS = {
  section: 'Timing',
  starts: 'Starts',
  atPlayhead: 'At playhead',
  length: 'Length',
  endsAt: 'Ends at',
  motion: 'Motion',
  whenItEnds: 'When it ends',
} as const;

/** Words for the outline and the inside of an area. The outline is the Border, the inside is the Fill. */
export const BOUNDARY_TERMS = {
  border: 'Border',
  borderColor: 'Border color',
  borderWidth: 'Border width',
  fill: 'Fill',
  fillColor: 'Fill color',
  fillOpacity: 'Fill opacity',
  animation: 'Animation',
} as const;

/** How an area appears. `none` shows it at once. */
export const BOUNDARY_ANIMATION_LABELS = {
  none: 'Off',
  fade: 'Fade in',
  draw: 'Outline',
  trace: 'Trace',
} as const;

export const ROUTE_TERMS = {
  /** The switch that makes the camera move along the route. */
  followCamera: 'Follow camera',
} as const;

/** Words of the camera view panel. A camera view is one saved position of the map camera. */
export const CAMERA_VIEW_TERMS = {
  /** Tooltip of the toolbar button that adds one. */
  add: 'Add camera view',
  /** The timeline row that holds every camera view. */
  track: 'Camera views',
  selectOne: 'Select a camera view in the timeline to edit it.',
  help: 'Move the map to the view you want. Then click Use current view.',
  useCurrent: 'Use current view',
  goTo: 'Go to this view',
} as const;

/** Words for the length of the whole video. */
export const DURATION_TERMS = {
  change: 'Change video length',
  /** Tells a user why their length was cut down. */
  limit: (maxSeconds: number) => `The free plan allows ${maxSeconds} seconds at most.`,
} as const;

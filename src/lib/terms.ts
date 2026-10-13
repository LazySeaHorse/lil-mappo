import type { FollowCameraBlock } from '@/store/followCamera';

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

/** The way a route travels. */
export const ROUTE_MODE_LABELS = {
  car: 'Car',
  walk: 'Walk',
  flight: 'Flight',
} as const;

/** Words of the path section in the route panel: a summary, and a draft that stays local until Apply. */
export const ROUTE_PATH_TERMS = {
  edit: 'Edit',
  /** Closes the editor when nothing changed. */
  close: 'Close',
  apply: 'Apply',
  cancel: 'Cancel',
  preview: 'Preview route',
  /** Summary of an imported path, which has no start and end. */
  imported: 'Imported path',
  noPlaces: 'No places set',
  notSet: 'not set',
  noPoints: 'No points yet',
  onePoint: '1 point',
  points: (count: number) => `${count} points`,
  applied: 'Route updated.',
  previewReady: 'Route preview is ready.',
} as const;

/** Tells a user why Follow camera cannot turn on for a route. */
export const FOLLOW_CAMERA_BLOCKED = (block: FollowCameraBlock): string => {
  switch (block.reason) {
    case 'no-path':
      return `Add a route before you turn on ${ROUTE_TERMS.followCamera}.`;
    case 'overlap':
      return `${ROUTE_TERMS.followCamera} is already on for "${block.otherName}" during this time.`;
    case 'not-found':
      return 'This route does not exist.';
  }
};

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

/** One short line of help under each setting on the Map tab of the project settings. */
export const MAP_SETTING_HINTS = {
  projection: 'Globe shows a round Earth when you zoom out. Mercator shows a flat map.',
  lighting: 'Sets the time of day for the light on the map.',
  terrainHeight: 'Makes hills and mountains look taller. Turn on Terrain in the toolbar first.',
  stars: 'Sets how many stars show in space around the Earth.',
  fogColor: 'Sets the color of the haze at the horizon.',
  features3d: 'Turn on Buildings in the toolbar to see these.',
  landmarks: 'Shows famous buildings as 3D models.',
  trees: 'Shows trees in 3D.',
  facades: 'Shows more detail on the walls of buildings.',
} as const;

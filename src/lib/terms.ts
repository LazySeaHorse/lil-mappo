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
  /** The summary row at the top of the panel: "Area: Paris" and a button. */
  area: 'Area',
  unnamed: 'No name',
  change: 'Change',
  cancel: 'Cancel',
  /** How much of the outline the Trace animation lights up at one time. */
  highlightLength: 'Highlight length',
  highlightHint: 'How much of the outline lights up at one time.',
  highlightEnds: ['Short', 'Long'],
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

/** How the line of a route appears. The hint says what the user sees. */
export const ROUTE_ANIMATION_TERMS = {
  label: 'How the line appears',
  draw: { label: 'Draw', hint: 'The line draws itself from the start to the end.' },
  navigation: { label: 'Route ahead', hint: 'The whole line shows. The part behind the marker goes away.' },
  comet: { label: 'Moving trail', hint: 'A short trail moves along the route.' },
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

/** Words of Follow camera in the route panel and in its own panel. */
export const FOLLOW_CAMERA_TERMS = {
  /** One line under the switch, when it is off. */
  hint: 'The camera follows the route while the video plays.',
  editCamera: 'Edit camera',
  /** The link at the top of the Follow camera panel. It goes back to the route panel. */
  backToRoute: 'Route',
  followView: { title: 'Follow view', description: 'Camera tracks the route.' },
  navigationView: { title: 'Navigation view', description: 'Camera faces forward along the route.' },
  /** Under the preset cards. Presets only fit Follow view. */
  presetsNote: 'A preset fits the camera to the length and time of this route.',
} as const;

/**
 * The sliders of the Follow camera panel. The words under the two ends of a slider
 * replace its number. The first word is the lowest value.
 */
export const FOLLOW_CAMERA_SLIDERS = {
  pitch: { label: 'Camera angle', ends: ['Overhead', 'Horizon'], hint: 'Tilts the camera. Low values look straight down.' },
  smoothing: { label: 'Smoothness', ends: ['Tight', 'Smooth'], hint: 'A smooth camera ignores small turns of the route.' },
  distance: { label: 'Distance', ends: ['Close', 'Far'], hint: 'How far the camera is from the vehicle.' },
  zoom: { label: 'Zoom', ends: ['Far', 'Close'], hint: 'How close the map looks.' },
  lookAhead: { label: 'Look ahead', ends: ['Near', 'Far'], hint: 'How far ahead on the route the camera looks.' },
  dynamics: { label: 'Movement', ends: ['Calm', 'Lively'], hint: 'How much the camera reacts to turns and speed.' },
  orbit: { label: 'Side drift', ends: ['Steady', 'Drifting'], hint: 'The camera slowly moves around the route.' },
  intro: { label: 'Opening shot', ends: ['None', 'Strong'], hint: 'Starts with a wide shot, then moves in.' },
  outro: { label: 'Closing shot', ends: ['None', 'Strong'], hint: 'Ends with a wide shot of the route.' },
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
  /** Toast when Duplicate finds no free time after the view. */
  noRoomToDuplicate: 'There is no time after this view for a copy. Move it earlier first.',
} as const;

/** Words for changing the style of a callout. */
export const STYLE_TERMS = {
  changed: 'Style changed.',
  undo: 'Undo',
  /** Opens the full list of styles. */
  change: 'Change',
  /** The text a style picture shows when the callout has no title. */
  sampleText: 'Paris',
} as const;

/** Labels of the callout text fields that need a plainer word than the code key. */
export const CALLOUT_TEXT_TERMS = {
  /** The small line above the title. The code key is `eyebrow`. */
  topLine: 'Top line',
} as const;

/** Words for the colors of a callout style. One accent color sets the main colors; the rest are folded away. */
export const ACCENT_TERMS = {
  accent: 'Accent color',
  customize: 'Customize colors',
} as const;

/** Words of the Location section of a callout. */
export const CALLOUT_LOCATION_TERMS = {
  /** Label and placeholder of the place search field. */
  search: 'Search for a place or enter coordinates',
  /** Opens the longitude and latitude fields. */
  exactPosition: 'Exact position',
  /** How far the callout floats above its point on the map. */
  heightAboveMap: 'Height above map',
  heightHint: 'Lifts the callout above its point on the map.',
  /** Turns on the handle that moves the point with the mouse. */
  dragOnMap: 'Drag point on map',
  doneDragging: 'Done',
  linkTitle: 'Use place name as title',
  updated: 'Callout location updated.',
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

import type { ModelEnter, ModelExit } from '@/store/types';
import { MAX_MODEL_BYTES, MAX_MODEL_URLS } from './glb';

/** Words for imported 3D models, shared by the toolbar, the model panel and the route marker. */
export const MODEL_TERMS = {
  /** Toolbar button tooltip and accessible name. */
  importButton: 'Import 3D model',
  imported: (name: string) => `Added ${name}.`,
  importFailed: 'Could not import this model.',
  /** The model's file is not in memory (a reloaded project). */
  missingTitle: 'Model file missing',
  missingBody: (fileName: string) => `3D models stay on this device and are not saved. Pick ${fileName} again to show it.`,
  relink: 'Relink model',
  /** A model that came from a link, when the link did not give it back on reload. */
  missingFromUrl: (fileName: string) => `Could not load ${fileName} from its link. Try again, or pick the file.`,
  retryUrl: 'Load from link again',
  relinked: 'Model relinked.',
  mismatch: (fileName: string) => `This is a different file from ${fileName}. Use it anyway?`,
  useAnyway: 'Use this file',
  cancel: 'Cancel',
  /** A project opened with models whose files are not in memory. */
  missingOnLoad: (count: number) =>
    count === 1 ? 'A 3D model in this project needs its file again.' : `${count} 3D models in this project need their files again.`,
  show: 'Show',
  /** Mapbox could not load the model's file. */
  failedTitle: 'Model could not be loaded',
  failedBody: (fileName: string) => `The map could not draw ${fileName}. Export it again from your 3D app as a .glb, then pick it here.`,
  pickOther: 'Pick another file',
  sameFileFailed: 'This is the same file the map could not load. Pick a different export.',
  loadFailed: (fileName: string) => `The map could not load ${fileName}.`,
  file: 'File',
  location: 'Search for a place or enter coordinates',
  dragHint: 'Drag to move the model',
  exactPosition: 'Exact position',
  altitude: 'Height above ground',
  altitudeHint: 'Lifts the model off the ground. 0 stands it on the ground.',
  heading: 'Heading',
  headingHint: 'Which way the model faces, clockwise from north.',
  tilt: 'Tilt',
  roll: 'Roll',
  size: 'Size',
  sizeHint: '1x is the size the model was made at.',
  /** The model's height as drawn, read-only under the size slider. */
  heightLabel: 'Height',
  enter: 'Appear',
  enterDuration: 'Appear duration',
  exit: 'Disappear',
  exitDuration: 'Disappear duration',
  /** The popup the toolbar and route marker buttons open. */
  popupTitle: '3D models',
  upload: 'Upload .glb',
  popupIntro: 'Drop your own 3D model onto the map.',
  /** What to know before picking a file. */
  popupFacts: [
    `Only .glb files, up to ${MAX_MODEL_BYTES / (1024 * 1024)} MB.`,
    'Your file stays in your browser and is never uploaded.',
    'After a reload, pick the file again, unless you added it from a link.',
  ],
  popupTag: '3D model',
  /** The popup's list of models the project already has. */
  listTitle: 'In this project',
  needsFile: 'Needs its file',
  /** Pasting links to .glb files. */
  urlLabel: 'Or paste .glb links',
  urlPlaceholder: 'https://example.com/model.glb',
  urlAdd: 'Add links',
  urlLoading: 'Loading',
  urlAdded: 'Added',
  urlSkipped: (count: number) => `${count} more ${count === 1 ? 'link was' : 'links were'} left out. Add up to ${MAX_MODEL_URLS} at a time.`,
  /** The popup's second step, after a model is picked or uploaded: where it goes and how big. */
  placeTitle: 'Place your model',
  reading: 'Reading the model',
  position: 'Position',
  positionCenter: 'Middle of the map',
  inspectorNote: 'Height above ground, heading, tilt, timing and the rest are in the inspector panel once it is added.',
  back: 'Back',
  add: 'Add to map',
  /** Route marker: the imported model card and picker. */
  customMarker: 'Custom',
  chooseModel: 'Model',
  importForMarker: 'Import .glb',
  markerMissing: 'Shows a dot until the model file is relinked.',
} as const;

export const MODEL_TRANSITION_LABELS: Record<ModelEnter | ModelExit, string> = {
  none: 'None',
  fade: 'Fade',
  'scale-up': 'Pop in',
  'scale-down': 'Shrink away',
  rise: 'Rise from ground',
  sink: 'Sink into ground',
};

/** A length in metres for people: one decimal under 10 m, whole metres, then km. */
export const formatMeters = (meters: number) =>
  meters >= 1000 ? `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km` : `${meters >= 10 ? Math.round(meters) : meters.toFixed(1)} m`;

/** A model file's size for people: KB under a megabyte, MB above. */
export const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

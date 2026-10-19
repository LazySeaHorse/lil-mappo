import type { ModelEnter, ModelExit } from '@/store/types';

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

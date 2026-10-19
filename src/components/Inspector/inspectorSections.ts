/**
 * The collapsible sections of each inspector panel, in one place.
 * `defaultOpen` is what a user sees until they open or close the section.
 * A section id is stored in the user's preferences, so do not rename one lightly.
 */
export interface InspectorSectionConfig {
  id: string;
  title: string;
  defaultOpen: boolean;
}

export const INSPECTOR_SECTIONS = {
  route: [
    { id: 'path', title: 'Path', defaultOpen: true },
    { id: 'line', title: 'Line', defaultOpen: true },
    { id: 'animation', title: 'Animation', defaultOpen: true },
    { id: 'marker', title: 'Marker', defaultOpen: true },
    { id: 'timing', title: 'Timing', defaultOpen: true },
    { id: 'camera', title: 'Camera', defaultOpen: true },
  ],
  boundary: [
    { id: 'appearance', title: 'Appearance', defaultOpen: true },
    { id: 'animation', title: 'Animation', defaultOpen: true },
    { id: 'timing', title: 'Timing', defaultOpen: true },
  ],
  callout: [
    { id: 'style', title: 'Style', defaultOpen: true },
    { id: 'location', title: 'Location', defaultOpen: true },
    { id: 'content', title: 'Text', defaultOpen: true },
    { id: 'appearance', title: 'Appearance', defaultOpen: true },
    { id: 'size', title: 'Size', defaultOpen: true },
    { id: 'connector', title: 'Anchor line', defaultOpen: true },
    { id: 'timing', title: 'Timing', defaultOpen: true },
  ],
  model: [
    { id: 'location', title: 'Location', defaultOpen: true },
    { id: 'rotation', title: 'Rotation', defaultOpen: true },
    { id: 'size', title: 'Size', defaultOpen: true },
    { id: 'timing', title: 'Timing', defaultOpen: true },
  ],
  'camera-kf': [
    { id: 'exact', title: 'Exact values', defaultOpen: false },
    { id: 'timing', title: 'Timing', defaultOpen: true },
  ],
  autocam: [
    { id: 'presets', title: 'Presets', defaultOpen: true },
  ],
  project: [
    { id: 'video', title: 'Video', defaultOpen: true },
    { id: 'env', title: 'Map', defaultOpen: true },
    { id: 'atmos', title: 'Atmosphere', defaultOpen: false },
    { id: 'labels', title: 'Labels', defaultOpen: true },
    { id: '3d', title: '3D features', defaultOpen: true },
  ],
} as const satisfies Record<string, readonly InspectorSectionConfig[]>;

export type InspectorSectionKind = keyof typeof INSPECTOR_SECTIONS;
export type InspectorSectionId<K extends InspectorSectionKind> =
  (typeof INSPECTOR_SECTIONS)[K][number]['id'];

import type { Locator } from './actions';
import type { InspectorSectionKind } from '@/components/Inspector/inspectorSections';
import { BOUNDARY_ADD_TERMS } from '@/lib/terms';

/**
 * Where the driver finds the app's controls, in one place. These are the
 * desktop (and tablet) toolbar and inspector; a phone variant can implement
 * the same table against the phone layout's mode bars and drawer.
 *
 * They lean on what the app already exposes: `data-walkthrough` ids, the
 * inspector sections' `data-section`, accessible names and visible labels.
 */
export interface Locators {
  /** The map style picker's trigger (inline in the toolbar on desktop). */
  mapStyleTrigger: Locator;
  /** The tablet toolbar's Map Display menu, which holds the style picker and toggles. */
  mapToolsMenu: Locator;
  mapStyleOption: (label: string) => Locator;
  savedMapStyle: (name: string) => Locator;
  mapSettingsButton: Locator;
  terrainToggle: Locator;
  buildingsToggle: Locator;

  addBoundaryButton: Locator;
  /** The Add Boundary panel (a Radix menu). */
  addBoundaryPanel: Locator;
  boundarySearchInput: Locator;
  boundaryResult: (placeName: string) => Locator;
  boundaryDetail: (label: string) => Locator;
  addPanelSwitch: (label: string) => Locator;
  addBoundaryConfirm: Locator;

  inspectorSection: (kind: InspectorSectionKind, id: string) => Locator;

  timelinePanel: Locator;
  /** The timeline's scroll box, which the zoom controls fit the clips into. */
  timelineViewport: Locator;
  /** A clip's bar: press it to move the clip. */
  timelineClip: (itemId: string) => Locator;
  /** A clip's edge handle: press it to trim that edge. */
  timelineHandle: (itemId: string, edge: 'start' | 'end') => Locator;
  timelineRuler: Locator;
  timelineZoomOut: Locator;
  /** The transport's jump to start button. */
  timelineJumpToStart: Locator;

  /** The toolbar button that adds a camera view at the playhead. */
  addCameraViewButton: Locator;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const addBoundaryPanel: Locator = { role: 'menu', description: 'the Add Boundary panel' };
const timelinePanel: Locator = { walkthrough: 'timeline-panel', description: 'the timeline' };

export const DESKTOP_LOCATORS: Locators = {
  mapStyleTrigger: { walkthrough: 'map-style', description: 'the map style picker' },
  mapToolsMenu: { walkthrough: 'map-tools', description: 'the Map Display menu' },
  mapStyleOption: (label) => ({
    role: 'radio',
    name: new RegExp(`^${escapeRegExp(label)}\\b`),
    within: { role: 'radiogroup', name: 'Map style' },
    description: `the ${label} map style`,
  }),
  savedMapStyle: (name) => ({
    role: 'button',
    name: new RegExp(`^${escapeRegExp(name)}\\b`),
    within: { role: 'group', name: 'Your styles' },
    description: `the saved style ${name}`,
  }),
  mapSettingsButton: { walkthrough: 'map-settings', description: 'the Map Settings button' },
  terrainToggle: { selector: 'button, [role="button"]', name: 'Terrain', description: 'the Terrain toggle' },
  buildingsToggle: { selector: 'button, [role="button"]', name: 'Buildings', description: 'the Buildings toggle' },

  addBoundaryButton: { walkthrough: 'add-boundary', description: 'the Add Boundary button' },
  addBoundaryPanel,
  boundarySearchInput: {
    role: 'textbox',
    name: 'Search for a place or region',
    within: { walkthrough: 'boundary-action' },
    description: 'the boundary search field',
  },
  boundaryResult: (placeName) => ({
    role: 'button',
    name: new RegExp(`^${escapeRegExp(placeName)}`),
    within: { walkthrough: 'boundary-action' },
    description: `the search result ${placeName}`,
  }),
  boundaryDetail: (label) => ({ role: 'radio', name: label, within: addBoundaryPanel, description: `the ${label} detail` }),
  addPanelSwitch: (label) => ({ label, role: 'switch', within: addBoundaryPanel, description: `the ${label} switch` }),
  addBoundaryConfirm: { role: 'button', name: new RegExp(BOUNDARY_ADD_TERMS.add), within: addBoundaryPanel, description: 'the Add boundary button' },

  inspectorSection: (kind, id) => ({ attrs: { 'data-section': `${kind}-${id}` }, description: `the ${kind} ${id} section` }),

  timelinePanel,
  timelineViewport: { attrs: { 'data-slot': 'scroll-area-viewport' }, within: timelinePanel, description: 'the timeline' },
  timelineClip: (itemId) => ({ attrs: { 'data-testid': `timeline-item-${itemId}` }, description: `the timeline clip ${itemId}` }),
  timelineHandle: (itemId, edge) => ({
    attrs: { 'data-testid': `timeline-item-${itemId}-${edge}-handle` },
    description: `the ${edge} handle of the clip ${itemId}`,
  }),
  timelineRuler: { attrs: { 'data-testid': 'timeline-ruler' }, description: 'the timeline ruler' },
  timelineZoomOut: { role: 'button', name: 'Zoom Out', within: timelinePanel, description: 'the timeline Zoom Out button' },
  timelineJumpToStart: { walkthrough: 'timeline-start', description: 'the timeline Jump to Start button' },

  addCameraViewButton: { walkthrough: 'camera-keyframe', description: 'the Add camera view button' },
};

/** The locators for the layout on screen. Desktop only for now. */
export function currentLocators(): Locators {
  return DESKTOP_LOCATORS;
}

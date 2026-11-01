import type { Locator } from './actions';
import type { InspectorSectionKind } from '@/components/Inspector/inspectorSections';
import { BOUNDARY_ADD_TERMS, CALLOUT_ADD_TERMS, SEARCH_TERMS, STYLE_TERMS } from '@/lib/terms';
import { MODEL_TERMS } from '@/models/modelTerms';

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

  // --- callouts ---
  addCalloutButton: Locator;
  /** The Add Callout panel (a Radix menu). */
  addCalloutPanel: Locator;
  calloutSearchInput: Locator;
  /** A result of a place search field's list (it opens in a popover outside the panel). */
  placeResult: (placeName: string) => Locator;
  addCalloutConfirm: Locator;
  /** The Pick on the map button next to a place search field, inside `within`. */
  pickOnMapButton: (within: Locator) => Locator;
  /** The name field at the top of an item's panel. */
  inspectorTitleField: (placeholder: string) => Locator;
  /** Opens the callout style grid. */
  styleChangeButton: Locator;
  styleCard: (styleName: string) => Locator;
  /** The closed group a panel keeps rarely used rows in (inside `within`). */
  disclosureToggle: (label: string, within: Element) => Locator;

  // --- 3D models ---
  modelButton: Locator;
  modelDialog: Locator;
  /** The upload button of the model dialog. */
  modelUploadButton: Locator;
  /** The dialog's hidden file input, which the picked .glb arrives in. */
  modelFileInput: Locator;
  /** A model the project already has, in the dialog's list. */
  modelListRow: (fileName: string) => Locator;
  modelAddButton: Locator;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const addBoundaryPanel: Locator = { role: 'menu', description: 'the Add Boundary panel' };
const addCalloutPanel: Locator = { role: 'menu', description: 'the Add Callout panel' };
const modelDialog: Locator = { role: 'dialog', description: 'the 3D model popup' };

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

  addCalloutButton: { walkthrough: 'add-callout', description: 'the Add Callout button' },
  addCalloutPanel,
  calloutSearchInput: {
    role: 'textbox',
    name: CALLOUT_ADD_TERMS.search,
    within: { walkthrough: 'callout-action' },
    description: 'the callout search field',
  },
  placeResult: (placeName) => ({
    role: 'button',
    selector: '.z-tour-popover button',
    name: new RegExp(`^${escapeRegExp(placeName)}`),
    description: `the search result ${placeName}`,
  }),
  addCalloutConfirm: { role: 'button', name: CALLOUT_ADD_TERMS.add, within: addCalloutPanel, description: 'the Add callout button' },
  pickOnMapButton: (within) => ({ role: 'button', name: SEARCH_TERMS.pickOnMap, within, description: 'the Pick on the map button' }),
  inspectorTitleField: (placeholder) => ({ role: 'textbox', name: placeholder, description: `the ${placeholder} field` }),
  styleChangeButton: {
    role: 'button',
    name: STYLE_TERMS.change,
    within: { attrs: { 'data-section': 'callout-style' } },
    description: 'the style Change button',
  },
  styleCard: (styleName) => ({
    role: 'button',
    name: styleName,
    within: { attrs: { 'data-section': 'callout-style' } },
    description: `the ${styleName} style`,
  }),
  disclosureToggle: (label, within) => ({ role: 'button', name: label, within, description: `the ${label} group` }),

  modelButton: { walkthrough: 'import-model', description: 'the 3D model button' },
  modelDialog,
  modelUploadButton: { role: 'button', name: MODEL_TERMS.upload, within: modelDialog, description: 'the Upload .glb button' },
  modelFileInput: { selector: 'input[type="file"][accept*=".glb"]', description: 'the model file input' },
  modelListRow: (fileName) => ({
    role: 'button',
    name: new RegExp(`^${escapeRegExp(fileName)}`),
    within: { selector: `ul[aria-label="${MODEL_TERMS.listTitle}"]` },
    description: `${fileName} in the model list`,
  }),
  modelAddButton: { role: 'button', name: MODEL_TERMS.add, within: modelDialog, description: 'the Add to map button' },
};

/** The locators for the layout on screen. Desktop only for now. */
export function currentLocators(): Locators {
  return DESKTOP_LOCATORS;
}

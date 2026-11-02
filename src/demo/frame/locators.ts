import type { Locator } from './actions';
import type { InspectorSectionKind } from '@/components/Inspector/inspectorSections';
import { BOUNDARY_ADD_TERMS, CALLOUT_ADD_TERMS, SEARCH_TERMS, STYLE_TERMS } from '@/lib/terms';
import { MODEL_TERMS } from '@/models/modelTerms';
import { MOBILE_QUERY, TABLET_QUERY } from '@/constants/layout';

/**
 * Where the driver finds the app's controls, in one place: one table for the
 * desktop (and tablet) toolbar and side inspector, one for the phone layout's
 * mode bars and inspector drawer (`currentLocators` picks).
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

  // --- the phone layout (the collapsed toolbar and the inspector drawer) ---
  /** The collapsed toolbar's "+" button, which swaps its bar for the Add tools. The desktop toolbar has none. */
  addMenuButton: Locator;
  /** The X that takes the collapsed toolbar's Add or Map Display bar back to its main bar. */
  toolbarBackButton: Locator;
  /** The phone's inspector drawer. */
  inspectorDrawer: Locator;
  /** The dimmed page behind the drawer: a tap on it closes the drawer. */
  inspectorBackdrop: Locator;

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
  /** CSS selector of the dialog's hidden file input, which the picked .glb arrives in (hidden, so not a Locator). */
  modelFileInputSelector: string;
  /** A model the project already has, in the dialog's list. */
  modelListRow: (fileName: string) => Locator;
  modelAddButton: Locator;
  // --- routes ---
  addRouteButton: Locator;
  /** The Plan Route panel (a Radix menu). */
  addRoutePanel: Locator;
  /** The Car / Walk / Flight switch of the panel. */
  routeMode: (label: string) => Locator;
  /** A place field of the panel, by its label above it (Start, End, Departure, Arrival). */
  routePlaceField: (label: string) => Locator;
  /** The Pick on the map button of a place field, by the label above it. */
  routePickOnMapButton: (label: string) => Locator;
  /** The Pick on the map button of the list of places of a hub and spoke plan. */
  routeSpokePickOnMapButton: Locator;
  /** The "+" pill of a place field that makes it a list of places. */
  routeMakeListPill: (label: string) => Locator;
  /** The search box of the list of places of a hub and spoke plan. */
  routeSpokeField: Locator;
  /** A result of a place or airport search (they open in a popover outside the panel). */
  routePlaceResult: (placeName: string) => Locator;
  routeAirportResult: (airportName: string) => Locator;
  routeTimingOption: (label: string) => Locator;
  routeGapField: Locator;
  routePreviewButton: Locator;
  routeInsertButton: Locator;
  routeCreateHubButton: Locator;
  routeImportButton: Locator;
  walkSmoothSwitch: Locator;
  walkAddPointButton: Locator;
  routeNameField: Locator;
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

  /** The transport's play / pause button. */
  timelinePlay: Locator;

  /** The toolbar's Export button, which opens the export modal. */
  exportButton: Locator;
  exportDialog: Locator;
  /** A select of the export modal, by its row's label. */
  exportSelect: (label: string) => Locator;
  /** An option of a segmented control of the export modal, by its row's label. */
  exportChoice: (label: string, option: string) => Locator;
  /** A number field of the export modal, by its row's label. */
  exportField: (label: string) => Locator;
  /** The modal's Export button (it says Export again after a first export). */
  exportConfirm: Locator;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const addBoundaryPanel: Locator = { role: 'menu', description: 'the Add Boundary panel' };
const addCalloutPanel: Locator = { role: 'menu', description: 'the Add Callout panel' };
const modelDialog: Locator = { role: 'dialog', description: 'the 3D model popup' };

// --- routes ---
const addRoutePanel: Locator = { role: 'menu', description: 'the Plan Route panel' };

const routeLocators = {
  addRouteButton: { walkthrough: 'add-route', description: 'the Plan Route button' },
  addRoutePanel,
  routeMode: (label: string) => ({ role: 'radio', name: label, within: addRoutePanel, description: `the ${label} travel mode` }),
  routePlaceField: (label: string) => ({ label, selector: 'input', within: addRoutePanel, description: `the ${label} place field` }),
  routePickOnMapButton: (label: string) => ({
    label,
    role: 'button',
    name: SEARCH_TERMS.pickOnMap,
    within: addRoutePanel,
    description: `the Pick on the map button of the ${label} place field`,
  }),
  routeSpokePickOnMapButton: {
    role: 'button',
    name: SEARCH_TERMS.pickOnMap,
    within: { selector: '[data-testid="hub-spoke-list"]', within: addRoutePanel },
    description: 'the Pick on the map button of the list of places',
  },
  routeMakeListPill: (label: string) => ({ label, role: 'button', name: 'Add more places', within: addRoutePanel, description: `the "add more places" pill of ${label}` }),
  routeSpokeField: { selector: '[data-testid="hub-spoke-list"] input', within: addRoutePanel, description: 'the list of places field' },
  routePlaceResult: (placeName: string) => ({
    selector: '[data-slot="popover-content"] button',
    name: new RegExp(`^${escapeRegExp(placeName)}`),
    description: `the search result ${placeName}`,
  }),
  routeAirportResult: (airportName: string) => ({
    role: 'option',
    name: new RegExp(`^${escapeRegExp(airportName)}`),
    description: `the airport ${airportName}`,
  }),
  routeTimingOption: (label: string) => ({ role: 'radio', name: label, within: addRoutePanel, description: `the "${label}" timing` }),
  routeGapField: { role: 'textbox', name: 'Gap', within: addRoutePanel, description: 'the gap field' },
  routePreviewButton: { role: 'button', name: /^Preview path/, within: addRoutePanel, description: 'the Preview path button' },
  routeInsertButton: { role: 'button', name: /^Insert (route|walk path)/, within: addRoutePanel, description: 'the Insert route button' },
  routeCreateHubButton: { role: 'button', name: /^Create \d+ routes?/, within: addRoutePanel, description: 'the Create routes button' },
  routeImportButton: { role: 'button', name: /route file/i, within: addRoutePanel, description: 'the import route file button' },
  walkSmoothSwitch: { label: 'Smooth Curve', role: 'switch', within: addRoutePanel, description: 'the Smooth Curve switch' },
  walkAddPointButton: { role: 'button', name: /^(Add point on map|Click map to place point)/, within: addRoutePanel, description: 'the Add point on map button' },
  routeNameField: { role: 'textbox', name: 'Route name', description: 'the route name field' },
} satisfies Partial<Locators>;
const exportDialog: Locator = { role: 'dialog', description: 'the export modal' };
const timelinePanel: Locator = { walkthrough: 'timeline-panel', description: 'the timeline' };

const toolbar: Locator = { selector: 'div[data-ph-unmask].h-14', description: 'the toolbar' };
const inspectorDrawer: Locator = { selector: '[data-slot="drawer-content"][data-walkthrough="inspector-panel"]', description: 'the inspector drawer' };

/** What only the collapsed toolbar and the drawer have: absent from the desktop layout, where the steps that use them find nothing and do nothing. */
const phoneOnlyLocators = {
  addMenuButton: { walkthrough: 'add-menu', description: 'the Add menu button' },
  toolbarBackButton: { selector: 'button:has(> svg.lucide-x)', within: toolbar, description: 'the toolbar close button' },
  inspectorDrawer,
  inspectorBackdrop: { selector: '[data-slot="drawer-overlay"]', description: 'the page behind the drawer' },
} satisfies Partial<Locators>;

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
  ...phoneOnlyLocators,

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
  modelFileInputSelector: 'input[type="file"][accept*=".glb"]',
  modelListRow: (fileName) => ({
    role: 'button',
    name: new RegExp(`^${escapeRegExp(fileName)}`),
    within: { selector: `ul[aria-label="${MODEL_TERMS.listTitle}"]` },
    description: `${fileName} in the model list`,
  }),
  modelAddButton: { role: 'button', name: MODEL_TERMS.add, within: modelDialog, description: 'the Add to map button' },
  ...routeLocators,
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

  timelinePlay: { walkthrough: 'timeline-play', description: 'the timeline Play button' },

  exportButton: { walkthrough: 'render', description: 'the Export button' },
  exportDialog,
  exportSelect: (label) => ({ label, role: 'combobox', within: exportDialog, description: `the export ${label} select` }),
  exportChoice: (label, option) => ({ label, role: 'radio', name: option, within: exportDialog, description: `the export ${label} ${option} option` }),
  exportField: (label) => ({ label, role: 'textbox', within: exportDialog, description: `the export ${label} field` }),
  exportConfirm: { role: 'button', name: /^Export (locally|again)/, within: exportDialog, description: 'the Export button of the export modal' },
};

/**
 * The phone layout: the same controls (the Add tools, the map controls and the
 * Export button keep their `data-walkthrough` ids and names), reached through
 * the collapsed toolbar's bars, with the inspector in a drawer. Its sections
 * are looked up in the drawer.
 */
export const PHONE_LOCATORS: Locators = {
  ...DESKTOP_LOCATORS,
  inspectorSection: (kind, id) => ({
    attrs: { 'data-section': `${kind}-${id}` },
    within: inspectorDrawer,
    description: `the ${kind} ${id} section`,
  }),
};

/** Whether the app is in its phone layout: the breakpoint `useResponsive` calls `isMobile`. */
export function isPhoneLayout(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches;
}

/** The layout flags the app's map framing takes. */
export function currentLayout(): { isMobile: boolean; isTablet: boolean } {
  return { isMobile: isPhoneLayout(), isTablet: window.matchMedia(TABLET_QUERY).matches };
}

/** The locators for the layout on screen. */
export function currentLocators(): Locators {
  return isPhoneLayout() ? PHONE_LOCATORS : DESKTOP_LOCATORS;
}

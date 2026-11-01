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

  // --- routes ---
  addRouteButton: Locator;
  /** The Plan Route panel (a Radix menu). */
  addRoutePanel: Locator;
  /** The Car / Walk / Flight switch of the panel. */
  routeMode: (label: string) => Locator;
  /** A place field of the panel, by its label above it (Start, End, Departure, Arrival). */
  routePlaceField: (label: string) => Locator;
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
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const addBoundaryPanel: Locator = { role: 'menu', description: 'the Add Boundary panel' };

// --- routes ---
const addRoutePanel: Locator = { role: 'menu', description: 'the Plan Route panel' };

const routeLocators = {
  addRouteButton: { walkthrough: 'add-route', description: 'the Plan Route button' },
  addRoutePanel,
  routeMode: (label: string) => ({ role: 'radio', name: label, within: addRoutePanel, description: `the ${label} travel mode` }),
  routePlaceField: (label: string) => ({ label, selector: 'input', within: addRoutePanel, description: `the ${label} place field` }),
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

  ...routeLocators,
};

/** The locators for the layout on screen. Desktop only for now. */
export function currentLocators(): Locators {
  return DESKTOP_LOCATORS;
}

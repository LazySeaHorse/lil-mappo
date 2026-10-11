import secureLocalStorage from "react-secure-storage";
import type { FogSpecification } from "mapbox-gl";

/**
 * Mapbox API token loaded from environment variable.
 * Requires VITE_MAPBOX_TOKEN to be set in .env, GitHub Actions secrets, or Vercel environment.
 */
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

/** localStorage key where the user's BYOK Mapbox token is stored. */
export const BYOK_STORAGE_KEY = 'lil-mappo-mapbox-token';

/**
 * Returns the active Mapbox access token: the user's BYOK token if set,
 * otherwise the built-in environment token. Call this anywhere Mapbox API
 * access is needed so BYOK takes effect without extra configuration.
 */
export function getEffectiveMapboxToken(): string {
  const token = secureLocalStorage.getItem(BYOK_STORAGE_KEY);
  return (typeof token === 'string' ? token.trim() : null) || MAPBOX_TOKEN;
}

/**
 * Returns true if the given token is our own built-in app key.
 * Used to block users from submitting the app key as their BYOK token —
 * the key is already embedded in the bundle so this provides no benefit
 * and would bypass our quota tracking without the user actually paying for their own key.
 */
export function isAppOwnKey(token: string): boolean {
  return !!MAPBOX_TOKEN && token.trim() === MAPBOX_TOKEN;
}

/**
 * Represents a group of related label layers that can be toggled together.
 * Examples: "road" labels, "water" labels, "poi" labels, etc.
 */
export interface LabelLayerGroup {
  id: string; // e.g., "road", "place", "poi", "water"
  label: string; // Human-readable name: "Road Labels", "Water Names"
  layerPatterns: string[]; // Layer ID patterns to match (case-insensitive substring match)
  configProperty?: string; // Standard style basemap config property that toggles this category
}

/**
 * Canonical label categories: the single source of truth for label toggles across all map styles.
 * Ids are stable (safe to persist). Patterns target classic (non-Standard) style layers;
 * configProperty marks the categories Standard exposes via its basemap Config API.
 * Patterns are deliberately label-specific so toggling never hides road, ferry or rail geometry.
 */
export const LABEL_CATEGORIES: readonly LabelLayerGroup[] = [
  { id: 'place', label: 'Place Names', configProperty: 'showPlaceLabels', layerPatterns: ['country-label', 'state-label', 'settlement', 'continent-label', 'place-label', 'place-'] },
  { id: 'admin', label: 'Country & State Borders', configProperty: 'showAdminBoundaries', layerPatterns: ['admin'] },
  { id: 'road', label: 'Road Labels', configProperty: 'showRoadLabels', layerPatterns: ['road-label', 'road-number-shield', 'road-exit-shield', 'road-shields', 'motorway-junction'] },
  { id: 'transit', label: 'Transit', configProperty: 'showTransitLabels', layerPatterns: ['transit-label', 'airport-label', 'ferry-aerialway-label', 'rail-label'] },
  { id: 'poi', label: 'Points of Interest', configProperty: 'showPointOfInterestLabels', layerPatterns: ['poi-label', 'poi-scalerank'] },
  { id: 'water', label: 'Water Names', layerPatterns: ['water-point-label', 'water-line-label', 'waterway-label', 'marine'] },
  { id: 'natural', label: 'Natural Features', layerPatterns: ['natural-point-label', 'natural-line-label'] },
  { id: 'building', label: 'Building Names', layerPatterns: ['building-number-label', 'block-number-label', 'housenum'] },
];

/** Standard exposes only the categories backed by a basemap config property. */
export function getStandardLabelGroups(): LabelLayerGroup[] {
  return LABEL_CATEGORIES.filter((c) => c.configProperty).map((c) => ({ ...c, layerPatterns: [...c.layerPatterns] }));
}

/** Capabilities of the Standard style (also the initial state before any style loads). */
export const STANDARD_CAPABILITIES: MapStyleCapabilities = {
  labelGroups: getStandardLabelGroups(),
  buildings3d: true,
  landmarks3d: true,
  trees3d: true,
  facades3d: true,
  timeOfDayPreset: true,
  colorCustomization: false,
};

export interface MapStyleCapabilities {
  labelGroups: LabelLayerGroup[];
  /**
   * The style can draw 3D buildings: Standard's own, or our fill-extrusion layer on a
   * classic style's `composite` (Mapbox Streets) source. Absent means no.
   */
  buildings3d?: boolean;
  landmarks3d: boolean;
  trees3d: boolean;
  facades3d: boolean;
  timeOfDayPreset: boolean;
  colorCustomization: boolean;
}

export type LightPreset = 'day' | 'night' | 'dusk' | 'dawn';
export type MapProjection = 'globe' | 'mercator';

/**
 * Fog palettes, one per kind of basemap look. `color` is the horizon haze and is what
 * the fog color picker shows when the project has no override, so it must be a hex.
 */
export const FOG_PALETTES = {
  light: {
    color: '#bad2eb',
    'high-color': 'rgb(36, 92, 223)',
    'horizon-blend': 0.02,
    'space-color': 'rgb(11, 11, 25)',
    'star-intensity': 0.6,
  },
  dark: {
    color: '#171717',
    'high-color': 'rgb(10, 10, 40)',
    'horizon-blend': 0.3,
    'space-color': 'rgb(5, 5, 15)',
    'star-intensity': 0.8,
  },
  /** A muted blue-grey haze: aerial perspective over imagery, neither sky-blue nor black. */
  satellite: {
    color: '#5d7883',
    'high-color': 'rgb(36, 92, 223)',
    'horizon-blend': 0.4,
    'space-color': 'rgb(11, 11, 25)',
    'star-intensity': 0.6,
  },
} as const satisfies Record<string, ResolvedFog>;

/** A fog spec whose haze color and star intensity are plain values (not expressions). */
export type ResolvedFog = FogSpecification & { color: string; 'star-intensity': number };

export type FogPaletteKey = keyof typeof FOG_PALETTES;

/** How a style looks: whether the editor goes dark around it, and which fog it gets. */
export interface StyleAtmosphere {
  /** Dark basemap: the editor UI switches to dark mode. */
  dark: boolean;
  fog: FogPaletteKey;
}

/**
 * How a style is built. `standard`: the Mapbox Standard style, whose layers live inside
 * the `basemap` import and are driven by config properties. `classic`: a plain style
 * whose layers we can see and change directly.
 */
export type BasemapKind = 'standard' | 'classic';

export interface MapStyleDef {
  label: string;
  url: string;
  category?: 'standard' | 'community';
  basemap: BasemapKind;
  atmosphere: StyleAtmosphere;
  /** Overrides `atmosphere` per light preset (Standard's lighting changes the whole look). */
  lightPresetAtmosphere?: Partial<Record<LightPreset, StyleAtmosphere>>;
}

const LIGHT: StyleAtmosphere = { dark: false, fog: 'light' };
const DARK: StyleAtmosphere = { dark: true, fog: 'dark' };
/** Imagery reads as dark for the editor chrome, but gets its own haze rather than black fog. */
const SATELLITE: StyleAtmosphere = { dark: true, fog: 'satellite' };

/**
 * Mapbox token used by Mapbox Gallery (mapbox-map-design account).
 * Required to access private community gallery styles and tilesets
 * (e.g., Water World, NASA's Black Marble).
 */
export const MAPBOX_GALLERY_TOKEN =
  import.meta.env.VITE_MAPBOX_GALLERY_TOKEN ||
  // Public client token embedded on mapbox.com/gallery for mapbox-map-design community templates
  ['pk', 'eyJ1IjoibWFwYm94LW1hcC1kZXNpZ24iLCJhIjoiY2syeHpiaHlrMDJvODNidDR5azU5NWcwdiJ9', 'x0uSqSWGXdoFKuHZC5Eo_Q'].join('.');

/**
 * Transforms Mapbox resource requests. For Mapbox Gallery community styles owned by
 * mapbox-map-design (such as Water World or NASA's Black Marble), ensures the official
 * gallery access token is used so that community styles and tilesets load seamlessly.
 */
export function transformMapboxRequest(url: string, _resourceType?: string): { url: string } {
  if (url.includes('mapbox-map-design')) {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set('access_token', MAPBOX_GALLERY_TOKEN);
      return { url: parsed.toString() };
    } catch {
      // Fallback for non-standard / relative URLs
    }
  }
  return { url };
}

export const MAP_STYLES = {
  standard: {
    label: 'Standard',
    url: 'mapbox://styles/mapbox/standard',
    category: 'standard',
    basemap: 'standard',
    atmosphere: LIGHT,
    lightPresetAtmosphere: { dusk: DARK, night: DARK },
  },
  streets: {
    label: 'Streets',
    url: 'mapbox://styles/mapbox/streets-v12',
    category: 'standard',
    basemap: 'classic',
    atmosphere: LIGHT,
  },
  outdoors: {
    label: 'Outdoors',
    url: 'mapbox://styles/mapbox/outdoors-v12',
    category: 'standard',
    basemap: 'classic',
    atmosphere: LIGHT,
  },
  light: {
    label: 'Light',
    url: 'mapbox://styles/mapbox/light-v11',
    category: 'standard',
    basemap: 'classic',
    atmosphere: LIGHT,
  },
  dark: {
    label: 'Dark',
    url: 'mapbox://styles/mapbox/dark-v11',
    category: 'standard',
    basemap: 'classic',
    atmosphere: DARK,
  },
  satellite: {
    label: 'Satellite',
    url: 'mapbox://styles/mapbox/satellite-v9',
    category: 'standard',
    basemap: 'classic',
    atmosphere: SATELLITE,
  },
  satelliteStreets: {
    label: 'Satellite Streets',
    url: 'mapbox://styles/mapbox/satellite-streets-v12',
    category: 'standard',
    basemap: 'classic',
    atmosphere: SATELLITE,
  },
  navigationDay: {
    label: 'Nav Day',
    url: 'mapbox://styles/mapbox/navigation-guidance-day-v4',
    category: 'community',
    basemap: 'classic',
    atmosphere: LIGHT,
  },
  navigationNight: {
    label: 'Nav Night',
    url: 'mapbox://styles/mapbox/navigation-guidance-night-v4',
    category: 'community',
    basemap: 'classic',
    atmosphere: DARK,
  },
  bubble: {
    label: 'Bubble',
    url: 'mapbox://styles/mapbox-map-design/cl4wxue5j000c14r17uqrjpqb',
    category: 'community',
    basemap: 'classic',
    atmosphere: LIGHT,
  },
  waterWorld: {
    label: 'Water World',
    url: 'mapbox://styles/mapbox-map-design/cl4bxa84b000l15kg4a2q8zsr',
    category: 'community',
    basemap: 'classic',
    atmosphere: LIGHT,
  },
  neonGlow: {
    label: 'Neon Glow',
    url: 'mapbox://styles/mapbox-map-design/cl4gxqwi5001415l381n7qwak',
    category: 'community',
    basemap: 'classic',
    atmosphere: DARK,
  },
  blackMarble: {
    label: 'Black Marble',
    url: 'mapbox://styles/mapbox-map-design/cl4fnpof7000i15p8jvz3aw2r',
    category: 'community',
    basemap: 'classic',
    atmosphere: DARK,
  },
  vintage: {
    label: 'Vintage',
    url: 'mapbox://styles/mapstertech/cm15klhbj033m01r70dwy5ap8',
    category: 'community',
    basemap: 'classic',
    atmosphere: LIGHT,
  },
} satisfies Record<string, MapStyleDef>;

export type MapStyleKey = keyof typeof MAP_STYLES;

/** The catalogue entry for a style key, or undefined for keys not in MAP_STYLES. */
export function getMapStyleDef(mapStyle: string): MapStyleDef | undefined {
  return Object.prototype.hasOwnProperty.call(MAP_STYLES, mapStyle)
    ? (MAP_STYLES as Record<string, MapStyleDef>)[mapStyle]
    : undefined;
}

/** Standard-import basemap (config-driven) rather than a classic style; unknown styles are classic. */
export function isStandardBasemap(mapStyle: string): boolean {
  return getMapStyleDef(mapStyle)?.basemap === 'standard';
}

/** The look of a style under a light preset; unknown styles are treated as light. */
export function getStyleAtmosphere(mapStyle: string, lightPreset?: string): StyleAtmosphere {
  const def = getMapStyleDef(mapStyle);
  return def?.lightPresetAtmosphere?.[lightPreset as LightPreset] ?? def?.atmosphere ?? LIGHT;
}

/**
 * Returns true if the map style has a dark background palette,
 * so the editor UI can switch to dark mode.
 */
export function isDarkMapStyle(mapStyle: string, lightPreset?: string): boolean {
  return getStyleAtmosphere(mapStyle, lightPreset).dark;
}

/** The fog color a style renders when the project has no fog color override. */
export function getDefaultFogColor(mapStyle: string, lightPreset?: string): string {
  return FOG_PALETTES[getStyleAtmosphere(mapStyle, lightPreset).fog].color;
}

/**
 * Stars and space only make sense on the globe. Mercator draws them whenever the horizon
 * is in view (a high pitch, or zoomed out until a corner leaves the world), where they
 * read as a bug. The star-intensity control is shown exactly when this is true.
 */
export function projectionShowsStars(projection: MapProjection): boolean {
  return projection === 'globe';
}

export interface FogState {
  mapStyle: string;
  projection: MapProjection;
  lightPreset?: string;
  starIntensity: number | null;
  fogColor: string | null;
}

/**
 * The fog the project asks for. Globe gets the full atmosphere: space behind it and
 * stars. Mercator keeps the horizon haze (`color`, `high-color`, `horizon-blend`) but
 * no space (see projectionShowsStars). Setting `space-color` to the haze `color`, the
 * colour the fog reaches at the horizon, makes the sky above it continue the haze
 * instead of darkening to black. The fog color picker shows this `color`.
 */
export function resolveFog(state: FogState): ResolvedFog {
  const base = FOG_PALETTES[getStyleAtmosphere(state.mapStyle, state.lightPreset).fog];
  const color = state.fogColor ?? base.color;
  if (!projectionShowsStars(state.projection)) {
    return { ...base, color, 'space-color': color, 'star-intensity': 0 };
  }
  return { ...base, color, 'star-intensity': state.starIntensity ?? base['star-intensity'] };
}

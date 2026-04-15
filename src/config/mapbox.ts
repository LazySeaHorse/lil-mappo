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
  return localStorage.getItem(BYOK_STORAGE_KEY)?.trim() || MAPBOX_TOKEN;
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
}

export interface MapStyleCapabilities {
  labelGroups: LabelLayerGroup[];
  landmarks3d: boolean;
  trees3d: boolean;
  facades3d: boolean;
  timeOfDayPreset: boolean;
  colorCustomization: boolean;
}

export interface MapStyleDef {
  label: string;
  url: string;
}

export const MAP_STYLES = {
  standard: {
    label: 'Standard',
    url: 'mapbox://styles/mapbox/standard',
  },
  streets: {
    label: 'Streets',
    url: 'mapbox://styles/mapbox/streets-v12',
  },
  outdoors: {
    label: 'Outdoors',
    url: 'mapbox://styles/mapbox/outdoors-v12',
  },
  light: {
    label: 'Light',
    url: 'mapbox://styles/mapbox/light-v11',
  },
  dark: {
    label: 'Dark',
    url: 'mapbox://styles/mapbox/dark-v11',
  },
  satellite: {
    label: 'Satellite',
    url: 'mapbox://styles/mapbox/satellite-v9',
  },
  satelliteStreets: {
    label: 'Satellite Streets',
    url: 'mapbox://styles/mapbox/satellite-streets-v12',
  },
} satisfies Record<string, MapStyleDef>;

export type MapStyleKey = keyof typeof MAP_STYLES;

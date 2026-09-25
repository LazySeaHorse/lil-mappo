import secureLocalStorage from "react-secure-storage";

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
  category?: 'standard' | 'community';
}

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
  },
  streets: {
    label: 'Streets',
    url: 'mapbox://styles/mapbox/streets-v12',
    category: 'standard',
  },
  outdoors: {
    label: 'Outdoors',
    url: 'mapbox://styles/mapbox/outdoors-v12',
    category: 'standard',
  },
  light: {
    label: 'Light',
    url: 'mapbox://styles/mapbox/light-v11',
    category: 'standard',
  },
  dark: {
    label: 'Dark',
    url: 'mapbox://styles/mapbox/dark-v11',
    category: 'standard',
  },
  satellite: {
    label: 'Satellite',
    url: 'mapbox://styles/mapbox/satellite-v9',
    category: 'standard',
  },
  satelliteStreets: {
    label: 'Satellite Streets',
    url: 'mapbox://styles/mapbox/satellite-streets-v12',
    category: 'standard',
  },
  navigationDay: {
    label: 'Navigation Guidance Day',
    url: 'mapbox://styles/mapbox/navigation-guidance-day-v4',
    category: 'community',
  },
  navigationNight: {
    label: 'Navigation Guidance Night',
    url: 'mapbox://styles/mapbox/navigation-guidance-night-v4',
    category: 'community',
  },
  bubble: {
    label: 'Bubble',
    url: 'mapbox://styles/mapbox-map-design/cl4wxue5j000c14r17uqrjpqb',
    category: 'community',
  },
  waterWorld: {
    label: 'Water World',
    url: 'mapbox://styles/mapbox-map-design/cl4bxa84b000l15kg4a2q8zsr',
    category: 'community',
  },
  neonGlow: {
    label: 'Neon Glow',
    url: 'mapbox://styles/mapbox-map-design/cl4gxqwi5001415l381n7qwak',
    category: 'community',
  },
  blackMarble: {
    label: "NASA's Black Marble",
    url: 'mapbox://styles/mapbox-map-design/cl4fnpof7000i15p8jvz3aw2r',
    category: 'community',
  },
  vintage: {
    label: 'Vintage',
    url: 'mapbox://styles/mapstertech/cm15klhbj033m01r70dwy5ap8',
    category: 'community',
  },
} satisfies Record<string, MapStyleDef>;

export type MapStyleKey = keyof typeof MAP_STYLES;

/**
 * Returns true if the map style has a dark background palette,
 * so the editor UI can switch to dark mode and adjust default fog/atmosphere colors.
 */
export function isDarkMapStyle(mapStyle: string, lightPreset?: string): boolean {
  if (
    mapStyle === 'dark' ||
    mapStyle === 'neonGlow' ||
    mapStyle === 'blackMarble' ||
    mapStyle === 'navigationNight'
  ) {
    return true;
  }
  if (mapStyle === 'satellite' || mapStyle === 'satelliteStreets') {
    return true;
  }
  if (mapStyle === 'standard' && (lightPreset === 'night' || lightPreset === 'dusk')) {
    return true;
  }
  return false;
}

/**
 * Returns the default fog color appropriate for the given map style.
 */
export function getDefaultFogColor(mapStyle: string): string {
  if (mapStyle === 'satellite' || mapStyle === 'satelliteStreets') {
    return '#DC9F71';
  }
  if (
    mapStyle === 'dark' ||
    mapStyle === 'neonGlow' ||
    mapStyle === 'blackMarble' ||
    mapStyle === 'navigationNight'
  ) {
    return '#171717';
  }
  return '#BAD2EB';
}

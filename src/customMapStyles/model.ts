/**
 * A custom map style: a built-in style (the project's `mapStyle`) with some of its colours
 * replaced. Colours are set per role (land, water, roads...); a role left out keeps the
 * built-in style's colour. Only the AI creates and edits them (paid plans).
 */

/** What each colour role paints. The text is also the AI's documentation. */
export const MAP_COLOR_ROLES = {
  land: 'The ground: the map background. On regular styles also the outlines around roads and the halos around labels.',
  water: 'Seas, lakes and rivers.',
  greenspace: 'Parks, woods and grass.',
  buildings: 'Buildings (footprints and 3D buildings).',
  roads: 'Streets and smaller roads.',
  trunks: 'Main roads.',
  motorways: 'Motorways and highways.',
  placeLabels: 'Names of countries, states, cities and neighbourhoods.',
  roadLabels: 'Street names.',
  poiLabels: 'Names of points of interest (shops, sights).',
  adminBoundaries: 'Country and state borders.',
  commercial: 'Commercial areas.',
  industrial: 'Industrial areas.',
  education: 'Schools and universities.',
  medical: 'Hospitals.',
} as const;

export type MapColorRole = keyof typeof MAP_COLOR_ROLES;

export const MAP_COLOR_ROLE_IDS = Object.keys(MAP_COLOR_ROLES) as [MapColorRole, ...MapColorRole[]];

/** Mapbox Standard's built-in colour themes. */
export const STANDARD_THEMES = ['default', 'faded', 'monochrome'] as const;
export type StandardTheme = (typeof STANDARD_THEMES)[number];

/** Custom style colours are `#rrggbb`, so they can be compared and measured without a colour parser. */
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const CUSTOM_STYLE_NAME_MAX = 60;

export interface CustomMapStyle {
  /** Shown in the style picker. */
  name: string;
  /** `#rrggbb` per role; a missing role keeps the built-in style's colour. */
  colors: Partial<Record<MapColorRole, string>>;
  /** Mapbox Standard's theme. Other styles ignore it. */
  theme: StandardTheme;
}

/** The Standard basemap config property behind each role. */
export const STANDARD_COLOR_CONFIG: Record<MapColorRole, string> = {
  land: 'colorLand',
  water: 'colorWater',
  greenspace: 'colorGreenspace',
  buildings: 'colorBuildings',
  roads: 'colorRoads',
  trunks: 'colorTrunks',
  motorways: 'colorMotorways',
  placeLabels: 'colorPlaceLabels',
  roadLabels: 'colorRoadLabels',
  poiLabels: 'colorPointOfInterestLabels',
  adminBoundaries: 'colorAdminBoundaries',
  commercial: 'colorCommercial',
  industrial: 'colorIndustrial',
  education: 'colorEducation',
  medical: 'colorMedical',
};

/** Standard draws POI names in one colour only in this mode; by default each category has its own. */
const STANDARD_POI_COLOR_MODE = 'colorModePointOfInterestLabels';

/** Every Standard config property a custom style can set. The others are left alone. */
export const STANDARD_CUSTOM_PROPERTIES: readonly string[] = [
  'theme',
  STANDARD_POI_COLOR_MODE,
  ...Object.values(STANDARD_COLOR_CONFIG),
];

/** The Standard config values a custom style sets; properties it does not set are absent. */
export function standardCustomConfig(style: CustomMapStyle | null): Record<string, string> {
  if (!style) return {};
  const config: Record<string, string> = { theme: style.theme };
  for (const role of MAP_COLOR_ROLE_IDS) {
    const color = style.colors[role];
    if (color) config[STANDARD_COLOR_CONFIG[role]] = color;
  }
  if (style.colors.poiLabels) config[STANDARD_POI_COLOR_MODE] = 'single';
  return config;
}

function channel(hex: string, offset: number): number {
  const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a `#rrggbb` colour, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/**
 * Dark when white text has more contrast on it than black text: the point where
 * (1 + 0.05) / (L + 0.05) = (L + 0.05) / 0.05, i.e. L ≈ 0.179.
 */
export function isDarkColor(hex: string): boolean {
  const l = relativeLuminance(hex);
  return 1.05 / (l + 0.05) > (l + 0.05) / 0.05;
}

/** Land, water and road colours for a picture of the style, the built-in ones where it sets none. */
export function customStyleSwatches(
  style: CustomMapStyle,
  base: readonly [string, string, string],
): [string, string, string] {
  return [style.colors.land ?? base[0], style.colors.water ?? base[1], style.colors.roads ?? base[2]];
}

/** Same look: same colours and theme (the name does not matter). */
export function sameCustomLook(a: CustomMapStyle, b: CustomMapStyle): boolean {
  return a.theme === b.theme && MAP_COLOR_ROLE_IDS.every((role) => a.colors[role] === b.colors[role]);
}

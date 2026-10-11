import { describe, expect, it, vi } from 'vitest';

vi.mock('react-secure-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

import {
  MAP_STYLES,
  MAPBOX_GALLERY_TOKEN,
  transformMapboxRequest,
  isDarkMapStyle,
  getDefaultFogColor,
  resolveFog,
  projectionShowsStars,
} from './mapbox';

describe('Mapbox configuration', () => {
  it('defines all required community mapbox styles from the gallery', () => {
    expect(MAP_STYLES).toHaveProperty('bubble');
    expect(MAP_STYLES).toHaveProperty('waterWorld');
    expect(MAP_STYLES).toHaveProperty('neonGlow');
    expect(MAP_STYLES).toHaveProperty('blackMarble');
    expect(MAP_STYLES).toHaveProperty('navigationDay');
    expect(MAP_STYLES).toHaveProperty('navigationNight');

    expect(MAP_STYLES.bubble).toMatchObject({
      label: 'Bubble',
      url: 'mapbox://styles/mapbox-map-design/cl4wxue5j000c14r17uqrjpqb',
      category: 'community',
    });

    expect(MAP_STYLES.waterWorld).toMatchObject({
      label: 'Water World',
      url: 'mapbox://styles/mapbox-map-design/cl4bxa84b000l15kg4a2q8zsr',
      category: 'community',
    });

    expect(MAP_STYLES.neonGlow).toMatchObject({
      label: 'Neon Glow',
      url: 'mapbox://styles/mapbox-map-design/cl4gxqwi5001415l381n7qwak',
      category: 'community',
    });

    expect(MAP_STYLES.blackMarble).toMatchObject({
      label: 'Black Marble',
      url: 'mapbox://styles/mapbox-map-design/cl4fnpof7000i15p8jvz3aw2r',
      category: 'community',
    });

    expect(MAP_STYLES.navigationDay).toMatchObject({
      label: 'Nav Day',
      url: 'mapbox://styles/mapbox/navigation-guidance-day-v4',
      category: 'community',
    });

    expect(MAP_STYLES.navigationNight).toMatchObject({
      label: 'Nav Night',
      url: 'mapbox://styles/mapbox/navigation-guidance-night-v4',
      category: 'community',
    });
  });

  it('transforms requests targeting mapbox-map-design to use the gallery access token', () => {
    const customStyleUrl =
      'https://api.mapbox.com/styles/v1/mapbox-map-design/cl4bxa84b000l15kg4a2q8zsr?access_token=pk.user-token';
    const transformedStyle = transformMapboxRequest(customStyleUrl);
    expect(transformedStyle.url).toContain(`access_token=${MAPBOX_GALLERY_TOKEN}`);

    const customTileUrl =
      'https://api.mapbox.com/v4/mapbox-map-design.cdfar9a6/0/0/0.png?access_token=pk.user-token';
    const transformedTile = transformMapboxRequest(customTileUrl);
    expect(transformedTile.url).toContain(`access_token=${MAPBOX_GALLERY_TOKEN}`);

    const standardUrl =
      'https://api.mapbox.com/styles/v1/mapbox/standard?access_token=pk.user-token';
    const untransformed = transformMapboxRequest(standardUrl);
    expect(untransformed.url).toBe(standardUrl);
  });

  it('correctly detects dark map styles', () => {
    expect(isDarkMapStyle('dark')).toBe(true);
    expect(isDarkMapStyle('neonGlow')).toBe(true);
    expect(isDarkMapStyle('blackMarble')).toBe(true);
    expect(isDarkMapStyle('navigationNight')).toBe(true);
    expect(isDarkMapStyle('satellite')).toBe(true);
    expect(isDarkMapStyle('satelliteStreets')).toBe(true);
    expect(isDarkMapStyle('standard', 'night')).toBe(true);
    expect(isDarkMapStyle('standard', 'dusk')).toBe(true);

    expect(isDarkMapStyle('standard', 'day')).toBe(false);
    expect(isDarkMapStyle('streets')).toBe(false);
    expect(isDarkMapStyle('outdoors')).toBe(false);
    expect(isDarkMapStyle('light')).toBe(false);
    expect(isDarkMapStyle('bubble')).toBe(false);
    expect(isDarkMapStyle('waterWorld')).toBe(false);
    expect(isDarkMapStyle('navigationDay')).toBe(false);
    expect(isDarkMapStyle('vintage')).toBe(false);
  });

  it('returns default fog colors matching style palettes', () => {
    expect(getDefaultFogColor('dark')).toBe('#171717');
    expect(getDefaultFogColor('neonGlow')).toBe('#171717');
    expect(getDefaultFogColor('blackMarble')).toBe('#171717');
    expect(getDefaultFogColor('navigationNight')).toBe('#171717');

    expect(getDefaultFogColor('satellite')).toBe('#5d7883');
    expect(getDefaultFogColor('satelliteStreets')).toBe('#5d7883');

    expect(getDefaultFogColor('standard')).toBe('#bad2eb');
    expect(getDefaultFogColor('standard', 'night')).toBe('#171717');
    expect(getDefaultFogColor('bubble')).toBe('#bad2eb');
    expect(getDefaultFogColor('waterWorld')).toBe('#bad2eb');
    expect(getDefaultFogColor('navigationDay')).toBe('#bad2eb');
  });
});

describe('resolveFog', () => {
  const state = (overrides: Partial<Parameters<typeof resolveFog>[0]> = {}) => ({
    mapStyle: 'standard', projection: 'globe' as const, lightPreset: 'day' as const,
    starIntensity: 0.6, fogColor: null, ...overrides,
  });

  it('renders the fog color the picker defaults to, for every style and light preset', () => {
    for (const mapStyle of [...Object.keys(MAP_STYLES), 'some-custom-style']) {
      for (const lightPreset of ['day', 'dawn', 'dusk', 'night'] as const) {
        expect(resolveFog(state({ mapStyle, lightPreset })).color, `${mapStyle} ${lightPreset}`)
          .toBe(getDefaultFogColor(mapStyle, lightPreset));
      }
    }
  });

  it('gives satellite imagery its own blue-grey haze, not the dark-style fog', () => {
    expect(resolveFog(state({ mapStyle: 'satellite' }))).toMatchObject({ color: '#5d7883', 'horizon-blend': 0.4 });
    expect(resolveFog(state({ mapStyle: 'satelliteStreets' })).color).toBe('#5d7883');
    expect(resolveFog(state({ mapStyle: 'dark' })).color).toBe('#171717');
  });

  it('follows the Standard light preset: dark fog at dusk and night', () => {
    expect(resolveFog(state({ lightPreset: 'day' })).color).toBe('#bad2eb');
    expect(resolveFog(state({ lightPreset: 'dawn' })).color).toBe('#bad2eb');
    expect(resolveFog(state({ lightPreset: 'dusk' })).color).toBe('#171717');
    expect(resolveFog(state({ lightPreset: 'night' })).color).toBe('#171717');
    // Classic styles have no light preset
    expect(resolveFog(state({ mapStyle: 'streets', lightPreset: 'night' })).color).toBe('#bad2eb');
  });

  it('draws stars exactly when the projection shows them', () => {
    expect(projectionShowsStars('globe')).toBe(true);
    expect(projectionShowsStars('mercator')).toBe(false);
    for (const projection of ['globe', 'mercator'] as const) {
      const stars = resolveFog(state({ projection, starIntensity: 0.7 }))['star-intensity'];
      expect(stars).toBe(projectionShowsStars(projection) ? 0.7 : 0);
    }
  });
});

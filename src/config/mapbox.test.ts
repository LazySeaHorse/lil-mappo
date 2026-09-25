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
} from './mapbox';

describe('Mapbox configuration', () => {
  it('defines all required community mapbox styles from the gallery', () => {
    expect(MAP_STYLES).toHaveProperty('bubble');
    expect(MAP_STYLES).toHaveProperty('waterWorld');
    expect(MAP_STYLES).toHaveProperty('neonGlow');
    expect(MAP_STYLES).toHaveProperty('blackMarble');
    expect(MAP_STYLES).toHaveProperty('navigationDay');
    expect(MAP_STYLES).toHaveProperty('navigationNight');

    expect(MAP_STYLES.bubble).toEqual({
      label: 'Bubble',
      url: 'mapbox://styles/mapbox-map-design/cl4wxue5j000c14r17uqrjpqb',
      category: 'community',
    });

    expect(MAP_STYLES.waterWorld).toEqual({
      label: 'Water World',
      url: 'mapbox://styles/mapbox-map-design/cl4bxa84b000l15kg4a2q8zsr',
      category: 'community',
    });

    expect(MAP_STYLES.neonGlow).toEqual({
      label: 'Neon Glow',
      url: 'mapbox://styles/mapbox-map-design/cl4gxqwi5001415l381n7qwak',
      category: 'community',
    });

    expect(MAP_STYLES.blackMarble).toEqual({
      label: "NASA's Black Marble",
      url: 'mapbox://styles/mapbox-map-design/cl4fnpof7000i15p8jvz3aw2r',
      category: 'community',
    });

    expect(MAP_STYLES.navigationDay).toEqual({
      label: 'Navigation Guidance Day',
      url: 'mapbox://styles/mapbox/navigation-guidance-day-v4',
      category: 'community',
    });

    expect(MAP_STYLES.navigationNight).toEqual({
      label: 'Navigation Guidance Night',
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

    expect(getDefaultFogColor('satellite')).toBe('#DC9F71');
    expect(getDefaultFogColor('satelliteStreets')).toBe('#DC9F71');

    expect(getDefaultFogColor('standard')).toBe('#BAD2EB');
    expect(getDefaultFogColor('bubble')).toBe('#BAD2EB');
    expect(getDefaultFogColor('waterWorld')).toBe('#BAD2EB');
    expect(getDefaultFogColor('navigationDay')).toBe('#BAD2EB');
  });
});

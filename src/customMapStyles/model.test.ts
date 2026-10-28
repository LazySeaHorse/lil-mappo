import { describe, expect, it } from 'vitest';
import { getStyleAtmosphere, isDarkMapStyle, resolveFog } from '@/config/mapbox';
import { parseProjectDocument, createProject, toProjectDocument } from '@/store/projectDocument';
import {
  STANDARD_COLOR_CONFIG,
  STANDARD_CUSTOM_PROPERTIES,
  isDarkColor,
  sameCustomLook,
  standardCustomConfig,
  type CustomMapStyle,
} from './model';

const ink: CustomMapStyle = { name: 'Ink', colors: { land: '#101820', water: '#2a4b5c' }, theme: 'default' };

describe('standardCustomConfig', () => {
  it('maps each colour to its Standard config property, with the theme', () => {
    expect(standardCustomConfig(ink)).toEqual({ theme: 'default', colorLand: '#101820', colorWater: '#2a4b5c' });
    expect(standardCustomConfig(null)).toEqual({});
  });

  it('switches POI names to one colour when the style sets it', () => {
    expect(standardCustomConfig({ ...ink, colors: { poiLabels: '#ffffff' } })).toEqual({
      theme: 'default',
      colorPointOfInterestLabels: '#ffffff',
      colorModePointOfInterestLabels: 'single',
    });
  });

  it('only ever sets the properties it manages', () => {
    const all = Object.fromEntries(Object.keys(STANDARD_COLOR_CONFIG).map((role) => [role, '#123456']));
    expect(Object.keys(standardCustomConfig({ ...ink, colors: all })).sort()).toEqual([...STANDARD_CUSTOM_PROPERTIES].sort());
  });
});

describe('isDarkColor', () => {
  it('is dark where white text reads better than black', () => {
    expect(isDarkColor('#000000')).toBe(true);
    expect(isDarkColor('#1f2a44')).toBe(true);
    expect(isDarkColor('#777777')).toBe(false);
    expect(isDarkColor('#f2e8d5')).toBe(false);
  });
});

describe('sameCustomLook', () => {
  it('compares colours and theme, not the name', () => {
    expect(sameCustomLook(ink, { ...ink, name: 'Other' })).toBe(true);
    expect(sameCustomLook(ink, { ...ink, theme: 'faded' })).toBe(false);
    expect(sameCustomLook(ink, { ...ink, colors: { land: '#101820' } })).toBe(false);
  });
});

describe('custom style atmosphere', () => {
  it('follows the land colour, except under Standard dusk and night and on imagery', () => {
    expect(isDarkMapStyle('light', 'day', ink)).toBe(true);
    expect(isDarkMapStyle('dark', 'day', { ...ink, colors: { land: '#f2e8d5' } })).toBe(false);
    expect(isDarkMapStyle('standard', 'night', { ...ink, colors: { land: '#f2e8d5' } })).toBe(true);
    expect(isDarkMapStyle('light', 'day', { ...ink, colors: { water: '#000000' } })).toBe(false);
    expect(getStyleAtmosphere('satellite', 'day', { ...ink, colors: { land: '#f2e8d5' } }).fog).toBe('satellite');
    expect(resolveFog({ mapStyle: 'light', projection: 'globe', customStyle: ink, starIntensity: null, fogColor: null }).color).toBe('#171717');
  });
});

describe('custom style in the project document', () => {
  it('round-trips and defaults to none', () => {
    expect(createProject().customStyle).toBeNull();
    const project = createProject({ mapStyle: 'streets', customStyle: ink });
    expect(parseProjectDocument(toProjectDocument(project)).customStyle).toEqual(ink);
  });

  it('loads an invalid custom style as none, and drops unknown colour roles', () => {
    const document = toProjectDocument(createProject());
    expect(parseProjectDocument({ ...document, customStyle: { name: 'x', colors: { land: 'red' } } }).customStyle).toBeNull();
    expect(parseProjectDocument({ ...document, customStyle: { name: 'x', colors: { land: '#000000', sky: '#ffffff' } } }).customStyle)
      .toEqual({ name: 'x', colors: { land: '#000000' }, theme: 'default' });
  });
});

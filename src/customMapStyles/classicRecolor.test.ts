import { describe, expect, it } from 'vitest';
import { classicColorRoles, classicColorTargets, recolorValue, type RecolorLayer } from './classicRecolor';

const layer = (id: string, type: string, sourceLayer?: string, layout?: Record<string, unknown>): RecolorLayer =>
  ({ id, type, ...(sourceLayer ? { 'source-layer': sourceLayer } : {}), ...(layout ? { layout } : {}) });

const targetOf = (l: RecolorLayer, property: string) => {
  const target = classicColorTargets(l).find((t) => t.property === property);
  if (!target) throw new Error(`no ${property} target on ${l.id}`);
  return target;
};

describe('classicColorTargets', () => {
  it('gives each kind of layer its role from what it draws', () => {
    expect(classicColorTargets(layer('land', 'background'))).toEqual([{ property: 'background-color', role: 'land' }]);
    expect(classicColorTargets(layer('water', 'fill', 'water'))).toEqual([{ property: 'fill-color', role: 'water' }]);
    expect(classicColorTargets(layer('waterway', 'line', 'waterway'))).toEqual([{ property: 'line-color', role: 'water' }]);
    expect(classicColorTargets(layer('building', 'fill', 'building'))).toEqual([
      { property: 'fill-color', role: 'buildings' },
      { property: 'fill-outline-color', role: 'buildings' },
    ]);
    expect(classicColorTargets(layer('admin-0-boundary', 'line', 'admin'))).toEqual([{ property: 'line-color', role: 'adminBoundaries' }]);
  });

  it('paints outlines under roads and borders with the land colour', () => {
    expect(classicColorTargets(layer('road-primary-case', 'line', 'road'))).toEqual([{ property: 'line-color', role: 'land' }]);
    expect(classicColorTargets(layer('road-path-bg', 'line', 'road'))).toEqual([{ property: 'line-color', role: 'land' }]);
    expect(classicColorTargets(layer('admin-0-boundary-bg', 'line', 'admin'))).toEqual([{ property: 'line-color', role: 'land' }]);
  });

  it('colours label text by kind, keeps text drawn on its own icon, and gives every halo the land colour', () => {
    const roles = (l: RecolorLayer) => classicColorTargets(l).map((t) => ('role' in t ? `${t.property}:${t.role}` : t.property));
    expect(roles(layer('settlement-major-label', 'symbol', 'place_label', { 'text-field': 'x' }))).toEqual(['text-halo-color:land', 'text-color:placeLabels']);
    expect(roles(layer('road-label', 'symbol', 'road', { 'text-field': 'x' }))).toEqual(['text-halo-color:land', 'text-color:roadLabels']);
    expect(roles(layer('road-number-shield', 'symbol', 'road', { 'text-field': 'x', 'icon-image': 'shield' }))).toEqual(['text-halo-color:land']);
    expect(roles(layer('poi-label', 'symbol', 'poi_label', { 'text-field': 'x', 'icon-image': 'maki' }))).toEqual(['text-halo-color:land', 'text-color:poiLabels']);
    expect(roles(layer('oneway-arrow', 'symbol', 'road', { 'icon-image': 'arrow' }))).toEqual([]);
  });

  it('leaves layers alone that draw other data or none of its own', () => {
    expect(classicColorTargets(layer('hillshade', 'fill', 'hillshade'))).toEqual([]);
    expect(classicColorTargets(layer('satellite', 'raster'))).toEqual([]);
    expect(classicColorTargets(layer('route-line', 'line'))).toEqual([]);
  });
});

describe('classicColorRoles', () => {
  it('lists the roles that change something, in role order', () => {
    expect(classicColorRoles([
      layer('road-label', 'symbol', 'road', { 'text-field': 'x' }),
      layer('water', 'fill', 'water'),
    ])).toEqual(['land', 'water', 'roadLabels']);
    expect(classicColorRoles([layer('satellite', 'raster')])).toEqual([]);
  });
});

describe('recolorValue', () => {
  const road = targetOf(layer('road-street', 'line', 'road'), 'line-color');
  const landuse = targetOf(layer('landuse', 'fill', 'landuse'), 'fill-color');

  it('keeps the style value when the custom style has no colour for the target', () => {
    expect(recolorValue({ property: 'fill-color', role: 'water' }, { land: '#000000' }, '#aaccff')).toBeUndefined();
    expect(recolorValue(road, { land: '#000000' }, '#ffffff')).toBeUndefined();
  });

  it('puts the chosen classes in front of the style value and keeps the rest', () => {
    expect(recolorValue(road, { motorways: '#ff0000' }, '#ffffff')).toEqual(
      ['match', ['get', 'class'], ['motorway', 'motorway_link'], '#ff0000', '#ffffff'],
    );
  });

  it('keeps a zoom curve on top and overrides inside each of its outputs', () => {
    const curve = ['interpolate', ['linear'], ['zoom'], 5, '#111111', 12, ['match', ['get', 'class'], 'rail', '#222222', '#333333']];
    expect(recolorValue(road, { trunks: '#00ff00' }, curve)).toEqual([
      'interpolate', ['linear'], ['zoom'],
      5, ['match', ['get', 'class'], ['trunk', 'trunk_link'], '#00ff00', '#111111'],
      12, ['match', ['get', 'class'], ['trunk', 'trunk_link'], '#00ff00', ['match', ['get', 'class'], 'rail', '#222222', '#333333']],
    ]);
    const steps = ['step', ['zoom'], '#111111', 10, '#222222'];
    expect(recolorValue(road, { trunks: '#00ff00' }, steps)).toEqual([
      'step', ['zoom'],
      ['match', ['get', 'class'], ['trunk', 'trunk_link'], '#00ff00', '#111111'],
      10, ['match', ['get', 'class'], ['trunk', 'trunk_link'], '#00ff00', '#222222'],
    ]);
  });

  it('turns legacy zoom functions into curves, and gives up on other legacy functions', () => {
    expect(recolorValue(road, { roads: '#0000ff' }, { base: 1.5, stops: [[10, '#111111'], [14, '#222222']] })).toEqual([
      'interpolate', ['exponential', 1.5], ['zoom'],
      10, ['match', ['get', 'class'], expect.arrayContaining(['street']), '#0000ff', '#111111'],
      14, ['match', ['get', 'class'], expect.arrayContaining(['street']), '#0000ff', '#222222'],
    ]);
    expect(recolorValue(road, { roads: '#0000ff' }, { type: 'interval', stops: [[10, '#111111'], [14, '#222222']] })).toEqual([
      'step', ['zoom'],
      ['match', ['get', 'class'], expect.anything(), '#0000ff', '#111111'],
      14, ['match', ['get', 'class'], expect.anything(), '#0000ff', '#222222'],
    ]);
    expect(recolorValue(road, { roads: '#0000ff' }, { property: 'class', type: 'categorical', stops: [['street', '#111111']] })).toBeUndefined();
  });

  it('paints the classes without a role of their own with the land colour, so no old colour is left', () => {
    expect(recolorValue(landuse, { land: '#101010', medical: '#ff0000' }, '#cccccc')).toEqual(
      ['match', ['get', 'class'], ['hospital'], '#ff0000', '#101010'],
    );
    expect(recolorValue(landuse, { land: '#101010' }, '#cccccc')).toBe('#101010');
  });
});

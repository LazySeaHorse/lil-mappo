import { describe, expect, it, vi } from 'vitest';
import type { BoundaryItem } from '@/store/types';
import { DEFAULT_BOUNDARY_STYLE } from '@/store/itemFactories';
import {
  type ActiveMask,
  buildMaskRegions,
  maskSetKey,
  type MaskRegions,
  resolveActiveMasks,
  resolveRegionPaint,
} from './boundaryMaskModel';

function square(x: number, y: number, size: number): GeoJSON.Position[] {
  return [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]];
}
const poly = (x: number, y: number, size: number): GeoJSON.Polygon => ({ type: 'Polygon', coordinates: [square(x, y, size)] });

function ringArea(ring: GeoJSON.Position[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(sum) / 2;
}
/** Area of a polygon (outer minus holes) in square degrees. */
function polygonArea(rings: GeoJSON.Position[][]): number {
  return ringArea(rings[0]) - rings.slice(1).reduce((total, ring) => total + ringArea(ring), 0);
}
function area(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | undefined): number {
  if (!geometry) return 0;
  return geometry.type === 'Polygon' ? polygonArea(geometry.coordinates) : geometry.coordinates.reduce((t, p) => t + polygonArea(p), 0);
}
const WORLD_AREA = 360 * 2 * 85.0511;

const holes = (...geometries: GeoJSON.Geometry[]) => geometries.map((geometry, i) => ({ id: String.fromCharCode(97 + i), geometry }));
const featureById = (built: MaskRegions | null, id: number) => built?.data.features.find((f) => f.id === id);
/** Total area of the regions inside exactly this set of boundaries. */
function areaInside(built: MaskRegions | null, inside: string[]): number {
  return (built?.regions ?? [])
    .filter((r) => r.inside.length === inside.length && inside.every((id) => r.inside.includes(id)))
    .reduce((total, r) => total + area(featureById(built, r.id)?.geometry), 0);
}

describe('buildMaskRegions', () => {
  it('is the world minus the hole (id 0) plus the hole itself', () => {
    const built = buildMaskRegions(holes(poly(0, 0, 10)));
    expect(built?.regions).toEqual([{ id: 0, inside: [] }, { id: 1, inside: ['a'] }]);
    expect(area(featureById(built, 0)?.geometry)).toBeCloseTo(WORLD_AREA - 100);
    expect(area(featureById(built, 1)?.geometry)).toBeCloseTo(100);
  });

  it('cuts every part of a multipolygon', () => {
    const multi: GeoJSON.MultiPolygon = { type: 'MultiPolygon', coordinates: [[square(0, 0, 10)], [square(50, 50, 10)]] };
    expect(area(featureById(buildMaskRegions(holes(multi)), 0)?.geometry)).toBeCloseTo(WORLD_AREA - 200);
  });

  it('unions overlapping boundaries for the outside, so its holes do not overlap', () => {
    const outside = featureById(buildMaskRegions(holes(poly(0, 0, 10), poly(5, 5, 10))), 0);
    // 10x10 + 10x10 - 5x5 overlap
    expect(area(outside?.geometry)).toBeCloseTo(WORLD_AREA - 175);
    expect(outside?.geometry.type).toBe('Polygon');
    if (outside?.geometry.type === 'Polygon') expect(outside.geometry.coordinates).toHaveLength(2);
  });

  it('splits overlapping boundaries into pieces that know every boundary they are in', () => {
    const built = buildMaskRegions(holes(poly(0, 0, 10), poly(5, 5, 10)));
    expect(areaInside(built, ['a'])).toBeCloseTo(75);
    expect(areaInside(built, ['b'])).toBeCloseTo(75);
    expect(areaInside(built, ['a', 'b'])).toBeCloseTo(25);
  });

  it('keeps a boundary nested in another as its own piece', () => {
    const built = buildMaskRegions(holes(poly(0, 0, 10), poly(2, 2, 2)));
    expect(areaInside(built, ['a'])).toBeCloseTo(96);
    expect(areaInside(built, ['a', 'b'])).toBeCloseTo(4);
    expect(areaInside(built, ['b'])).toBe(0);
  });

  it('does not split neighbours whose outlines overlap by a sliver', () => {
    // 10x10 squares overlapping by 0.05 degrees along a shared border
    const built = buildMaskRegions(holes(poly(0, 0, 10), poly(9.95, 0, 10)));
    expect(built?.regions.map((r) => r.inside)).toEqual([[], ['a'], ['b']]);
    expect(area(featureById(built, 1)?.geometry)).toBeCloseTo(100);
  });

  it('keeps disjoint boundaries as separate pieces and holes', () => {
    const built = buildMaskRegions(holes(poly(0, 0, 10), poly(50, 50, 10)));
    expect(built?.regions.map((r) => r.inside)).toEqual([[], ['a'], ['b']]);
    const outside = featureById(built, 0);
    expect(area(outside?.geometry)).toBeCloseTo(WORLD_AREA - 200);
    if (outside?.geometry.type === 'Polygon') expect(outside.geometry.coordinates).toHaveLength(3);
  });

  it('leaves an interior hole (enclave) masked', () => {
    const withHole: GeoJSON.Polygon = { type: 'Polygon', coordinates: [square(0, 0, 10), square(4, 4, 2).reverse()] };
    const outside = featureById(buildMaskRegions(holes(withHole)), 0);
    expect(area(outside?.geometry)).toBeCloseTo(WORLD_AREA - 100 + 4);
    // the enclave comes back as its own polygon
    expect(outside?.geometry.type).toBe('MultiPolygon');
  });

  it('returns null for an empty set and for non-area geometries', () => {
    expect(buildMaskRegions([])).toBeNull();
    expect(buildMaskRegions(holes({ type: 'Point', coordinates: [0, 0] }))).toBeNull();
  });

  it('returns null instead of throwing on unusable geometry', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { type: 'Polygon', coordinates: [[[0, 0]]] } as GeoJSON.Polygon;
    expect(() => buildMaskRegions(holes(broken, poly(0, 0, 1)))).not.toThrow();
    warn.mockRestore();
  });
});

function boundary(id: string, overrides: Partial<BoundaryItem['style']> = {}, geojson: GeoJSON.Geometry | null = poly(0, 0, 1)): BoundaryItem {
  return {
    kind: 'boundary',
    id,
    placeName: id,
    geojson,
    resolveStatus: 'resolved',
    startTime: 0,
    endTime: 10,
    easing: 'linear',
    exitAnimation: 'none',
    style: { ...DEFAULT_BOUNDARY_STYLE, animateStroke: false, maskOutside: true, ...overrides },
  };
}

describe('resolveActiveMasks', () => {
  const at = (time: number) => () => time;

  it('excludes boundaries that are unmasked, unresolved, geometry-less or not yet drawing', () => {
    const items = [
      boundary('off', { maskOutside: false }),
      { ...boundary('loading'), resolveStatus: 'loading' as const },
      boundary('empty', {}, null),
      boundary('later'),
      boundary('on'),
    ];
    items[3] = { ...items[3], startTime: 5, endTime: 6 };
    expect(resolveActiveMasks(items, at(1)).map((m) => m.id)).toEqual(['on']);
  });

  it('reports the clamped mask opacity and the fill factor (including the fade exit) as reveal', () => {
    const b = { ...boundary('a', { maskOpacity: 0.8 }), exitAnimation: 'fade' as const };
    expect(resolveActiveMasks([b], at(5))[0]).toMatchObject({ opacity: 0.8, reveal: 1 });
    expect(resolveActiveMasks([b], at(10.25))[0].reveal).toBeCloseTo(0.5);
    expect(resolveActiveMasks([b], at(11))).toEqual([]);
    expect(resolveActiveMasks([boundary('c', { maskOpacity: 3 })], at(1))[0].opacity).toBe(1);
    expect(resolveActiveMasks([boundary('d', { maskOpacity: 0 })], at(1))).toEqual([]);
  });
});

describe('a fully drawn outline and the mask inside it', () => {
  it.each(['draw', 'trace'] as const)('leaves its own area at exactly 0 opacity, never negative (%s)', (animationStyle) => {
    const b = boundary('a', { animateStroke: true, animationStyle });
    for (const time of [10, 12]) {
      const active = resolveActiveMasks([b], () => time);
      expect(active[0].reveal).toBe(1);
      expect(resolveRegionPaint(['a'], active).opacity).toBe(0);
    }
  });
});

describe('resolveRegionPaint', () => {
  const mask = (id: string, opacity: number, reveal: number, color = '#000000'): ActiveMask =>
    ({ id, geometry: poly(0, 0, 1), color, opacity, reveal });

  it('paints the outside as dark as the darkest mask, in the strongest mask\'s color; the topmost wins a tie', () => {
    const top = mask('top', 0.3, 1, '#ff0000');
    const below = mask('below', 0.9, 1, '#00ff00');
    expect(resolveRegionPaint([], [top, below])).toEqual({ opacity: 0.9, color: '#00ff00' });
    expect(resolveRegionPaint([], [mask('x', 0.5, 1, '#111111'), mask('y', 0.5, 1, '#222222')]).color).toBe('#111111');
  });

  it('fades the outside in with a single boundary and keeps its own area clear', () => {
    expect(resolveRegionPaint([], [mask('a', 0.8, 0.5)]).opacity).toBeCloseTo(0.4);
    expect(resolveRegionPaint(['a'], [mask('a', 0.85, 0.5)]).opacity).toBe(0);
  });

  it('keeps the outside dark while one boundary hands over to the next', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const leaving = mask('a', 0.8, 1 - t);
      const arriving = mask('b', 0.8, t);
      expect(resolveRegionPaint([], [leaving, arriving].filter((m) => m.reveal > 0)).opacity).toBeCloseTo(0.8);
    }
    // a lighter mask taking over eases down to its own opacity
    expect(resolveRegionPaint([], [mask('a', 0.8, 0.25), mask('b', 0.4, 1)]).opacity).toBeCloseTo(0.6);
  });

  it('opens a second boundary\'s area as its fill comes in, from the other mask\'s darkness', () => {
    const a = mask('a', 0.8, 1);
    expect(resolveRegionPaint(['b'], [a, mask('b', 0.8, 0.5)]).opacity).toBeCloseTo(0.4);
    expect(resolveRegionPaint(['b'], [a, mask('b', 0.8, 1)]).opacity).toBe(0);
    // ...and the first boundary's area closes the same way as it leaves
    expect(resolveRegionPaint(['a'], [mask('a', 0.8, 0.25), mask('b', 0.8, 1)]).opacity).toBeCloseTo(0.6);
  });

  it('keeps an overlap clear while any boundary it lies in is fully shown', () => {
    const country = mask('country', 0.8, 0.1);
    const region = mask('region', 0.8, 1);
    expect(resolveRegionPaint(['country', 'region'], [country, region]).opacity).toBe(0);
    expect(resolveRegionPaint(['country'], [country, region]).opacity).toBeCloseTo(0.8 * 0.9);
  });

  it('is transparent when no mask lies outside the region', () => {
    expect(resolveRegionPaint([], []).opacity).toBe(0);
    expect(resolveRegionPaint(['a'], [mask('a', 1, 1)]).opacity).toBe(0);
  });
});

describe('maskSetKey', () => {
  it('changes with the set or a geometry reference, not with opacity', () => {
    const a = boundary('a');
    const [first] = resolveActiveMasks([a], () => 1);
    const [dimmer] = resolveActiveMasks([a], () => 0.5);
    expect(maskSetKey([first])).toBe(maskSetKey([dimmer]));
    const edited = { ...a, geojson: poly(0, 0, 1) };
    expect(maskSetKey(resolveActiveMasks([edited], () => 1))).not.toBe(maskSetKey([first]));
    expect(maskSetKey([])).toBe('');
  });
});

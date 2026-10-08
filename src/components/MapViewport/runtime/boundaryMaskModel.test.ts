import { describe, expect, it, vi } from 'vitest';
import type { BoundaryItem } from '@/store/types';
import { DEFAULT_BOUNDARY_STYLE } from '@/store/itemFactories';
import {
  buildMaskFeature,
  maskSetKey,
  resolveActiveMasks,
  resolveMaskPaint,
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
function maskArea(feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null): number {
  if (!feature) return 0;
  const g = feature.geometry;
  return g.type === 'Polygon' ? polygonArea(g.coordinates) : g.coordinates.reduce((t, p) => t + polygonArea(p), 0);
}
const WORLD_AREA = 360 * 2 * 85.0511;

describe('buildMaskFeature', () => {
  it('cuts a hole for a single polygon', () => {
    const feature = buildMaskFeature([poly(0, 0, 10)]);
    expect(feature?.geometry.type).toBe('Polygon');
    expect(maskArea(feature)).toBeCloseTo(WORLD_AREA - 100);
  });

  it('cuts every part of a multipolygon', () => {
    const multi: GeoJSON.MultiPolygon = { type: 'MultiPolygon', coordinates: [[square(0, 0, 10)], [square(50, 50, 10)]] };
    expect(maskArea(buildMaskFeature([multi]))).toBeCloseTo(WORLD_AREA - 200);
  });

  it('unions overlapping boundaries so the holes do not overlap', () => {
    const feature = buildMaskFeature([poly(0, 0, 10), poly(5, 5, 10)]);
    // 10x10 + 10x10 - 5x5 overlap
    expect(maskArea(feature)).toBeCloseTo(WORLD_AREA - 175);
    expect(feature?.geometry.type).toBe('Polygon');
    if (feature?.geometry.type === 'Polygon') expect(feature.geometry.coordinates).toHaveLength(2);
  });

  it('keeps disjoint boundaries as separate holes', () => {
    const feature = buildMaskFeature([poly(0, 0, 10), poly(50, 50, 10)]);
    expect(maskArea(feature)).toBeCloseTo(WORLD_AREA - 200);
    if (feature?.geometry.type === 'Polygon') expect(feature.geometry.coordinates).toHaveLength(3);
  });

  it('leaves an interior hole (enclave) masked', () => {
    const withHole: GeoJSON.Polygon = { type: 'Polygon', coordinates: [square(0, 0, 10), square(4, 4, 2).reverse()] };
    const feature = buildMaskFeature([withHole]);
    expect(maskArea(feature)).toBeCloseTo(WORLD_AREA - 100 + 4);
    // the enclave comes back as its own polygon
    expect(feature?.geometry.type).toBe('MultiPolygon');
  });

  it('returns null for an empty set and for non-area geometries', () => {
    expect(buildMaskFeature([])).toBeNull();
    expect(buildMaskFeature([{ type: 'Point', coordinates: [0, 0] }])).toBeNull();
  });

  it('returns null instead of throwing on unusable geometry', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { type: 'Polygon', coordinates: [[[0, 0]]] } as GeoJSON.Polygon;
    expect(() => buildMaskFeature([broken])).not.toThrow();
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

describe('resolveActiveMasks / resolveMaskPaint', () => {
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

  it('scales opacity by the fill factor, including the fade exit', () => {
    const b = { ...boundary('a', { maskOpacity: 0.8 }), exitAnimation: 'fade' as const };
    expect(resolveActiveMasks([b], at(5))[0].opacity).toBeCloseTo(0.8);
    expect(resolveActiveMasks([b], at(10.25))[0].opacity).toBeCloseTo(0.4);
    expect(resolveActiveMasks([b], at(11))).toEqual([]);
  });

  it('uses the strongest opacity and the topmost (first) active color', () => {
    const top = boundary('top', { maskColor: '#ff0000', maskOpacity: 0.3 });
    const below = boundary('below', { maskColor: '#00ff00', maskOpacity: 0.9 });
    expect(resolveMaskPaint(resolveActiveMasks([top, below], at(1)))).toEqual({ color: '#ff0000', opacity: 0.9 });
  });

  it('takes the color of the next active boundary when the topmost is inactive', () => {
    const top = { ...boundary('top', { maskColor: '#ff0000' }), startTime: 5, endTime: 6 };
    const below = boundary('below', { maskColor: '#00ff00', maskOpacity: 0.5 });
    expect(resolveMaskPaint(resolveActiveMasks([top, below], at(1)))).toEqual({ color: '#00ff00', opacity: 0.5 });
  });

  it('is transparent when nothing is active', () => {
    expect(resolveMaskPaint([]).opacity).toBe(0);
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

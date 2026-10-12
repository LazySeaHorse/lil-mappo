import { describe, it, expect } from 'vitest';
import {
  BOUNDARY_DETAIL_LEVELS, DEFAULT_BOUNDARY_DETAIL, applyBoundaryDetail, boundaryDetailSample,
} from './boundaryDetail';
import { syntheticIsland, decimals } from '@/test/syntheticGeometry';

const count = (g: GeoJSON.Geometry) =>
  g.type === 'Polygon' ? g.coordinates.reduce((n, r) => n + r.length, 0)
    : g.type === 'MultiPolygon' ? g.coordinates.flat().reduce((n, r) => n + r.length, 0) : 0;

describe('BOUNDARY_DETAIL_LEVELS', () => {
  it('defines detailed/standard/light with 1/10/50 m and defaults to standard', () => {
    expect(BOUNDARY_DETAIL_LEVELS.map((l) => [l.id, l.toleranceM])).toEqual([
      ['detailed', 1], ['standard', 10], ['light', 50],
    ]);
    for (const l of BOUNDARY_DETAIL_LEVELS) {
      expect(l.label).toBeTruthy();
      expect(l.hint).toBeTruthy();
    }
    expect(DEFAULT_BOUNDARY_DETAIL).toBe('standard');
  });
});

describe('applyBoundaryDetail', () => {
  const island = syntheticIsland();
  const detailed = applyBoundaryDetail(island, 'detailed');
  const standard = applyBoundaryDetail(island, 'standard');
  const light = applyBoundaryDetail(island, 'light');

  it('light < standard < detailed in point count, all smaller than the input', () => {
    expect(count(light)).toBeLessThan(count(standard));
    expect(count(standard)).toBeLessThan(count(detailed));
    expect(count(detailed)).toBeLessThan(count(island));
  });

  it('stores at most 6 decimals', () => {
    for (const g of [detailed, standard, light]) {
      for (const ring of (g as GeoJSON.Polygon).coordinates)
        for (const c of ring) for (const v of c) expect(decimals(v)).toBeLessThanOrEqual(6);
    }
  });

  it('keeps rings closed with at least 4 positions', () => {
    for (const g of [detailed, standard, light]) {
      for (const ring of (g as GeoJSON.Polygon).coordinates) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring[0]).toEqual(ring[ring.length - 1]);
      }
    }
  });

  it('keeps tiny rings valid (never fewer than 4 positions, still closed)', () => {
    const tiny: GeoJSON.MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [[[0, 0], [0.00001, 0], [0.00001, 0.00001], [0, 0]]],
        [[[1, 1], [1.2, 1], [1.2, 1.2], [1, 1.2], [1, 1]], [[1.05, 1.05], [1.06, 1.05], [1.06, 1.06], [1.05, 1.05]]],
      ],
    };
    for (const l of BOUNDARY_DETAIL_LEVELS) {
      const out = applyBoundaryDetail(tiny, l.id) as GeoJSON.MultiPolygon;
      for (const poly of out.coordinates) for (const ring of poly) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring[0]).toEqual(ring[ring.length - 1]);
      }
    }
  });

  it('memoises per (geometry, level)', () => {
    expect(applyBoundaryDetail(island, 'light')).toBe(light);
    expect(applyBoundaryDetail(island, 'standard')).toBe(standard);
    expect(applyBoundaryDetail(island, 'standard')).not.toBe(light);
  });
});

describe('boundaryDetailSample', () => {
  it('thumbnails use the real simplifier: fewer points at lighter levels', () => {
    const d = boundaryDetailSample('detailed').length;
    const s = boundaryDetailSample('standard').length;
    const l = boundaryDetailSample('light').length;
    expect(l).toBeLessThan(s);
    expect(s).toBeLessThan(d);
    expect(l).toBeGreaterThanOrEqual(3);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  coverFrame,
  drawFlagTile,
  type FlagDrawContext,
  latToWorldY,
  lngToWorldX,
  partsIntersectTile,
  prepareFlagParts,
  tileExtent,
  worldXToLng,
  worldYToLat,
} from './flagFill';

const square = (w: number, s: number, e: number, n: number): number[][] => [[w, s], [e, s], [e, n], [w, n], [w, s]];
const polygon = (...rings: number[][][]): GeoJSON.Polygon => ({ type: 'Polygon', coordinates: rings });
const multi = (...polys: number[][][][]): GeoJSON.MultiPolygon => ({ type: 'MultiPolygon', coordinates: polys });

describe('Web Mercator helpers', () => {
  it('maps lng/lat to world coordinates', () => {
    expect(lngToWorldX(-180)).toBe(0);
    expect(lngToWorldX(0)).toBe(0.5);
    expect(lngToWorldX(180)).toBe(1);
    expect(latToWorldY(0)).toBeCloseTo(0.5, 12);
    expect(latToWorldY(85.0511287798)).toBeCloseTo(0, 6);
    expect(latToWorldY(-85.0511287798)).toBeCloseTo(1, 6);
    expect(latToWorldY(60)).toBeLessThan(latToWorldY(30));
  });

  it('clamps beyond the Mercator limit', () => {
    expect(Number.isFinite(latToWorldY(90))).toBe(true);
  });

  it('round-trips', () => {
    expect(worldXToLng(lngToWorldX(12.5))).toBeCloseTo(12.5, 9);
    expect(worldYToLat(latToWorldY(48.85))).toBeCloseTo(48.85, 9);
  });

  it('gives tile extents', () => {
    expect(tileExtent(0, 0, 0)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(tileExtent(2, 1, 3)).toEqual({ x: 0.25, y: 0.75, w: 0.25, h: 0.25 });
  });
});

describe('coverFrame', () => {
  it('covers a wide bbox by width and centres it', () => {
    const f = coverFrame({ minX: 0.4, maxX: 0.6, minY: 0.5, maxY: 0.55 });
    expect(f.w).toBeCloseTo(0.2);
    expect(f.h).toBeCloseTo(0.15);
    expect(f.x + f.w / 2).toBeCloseTo(0.5);
    expect(f.y + f.h / 2).toBeCloseTo(0.525);
  });

  it('covers a tall bbox by height, keeping 4:3', () => {
    const f = coverFrame({ minX: 0.5, maxX: 0.55, minY: 0.2, maxY: 0.4 });
    expect(f.h).toBeCloseTo(0.2);
    expect(f.w).toBeCloseTo(0.2 * (4 / 3));
    expect(f.w / f.h).toBeCloseTo(4 / 3);
  });

  it('survives a degenerate bbox', () => {
    const f = coverFrame({ minX: 0.5, maxX: 0.5, minY: 0.5, maxY: 0.5 });
    expect(Number.isFinite(f.w)).toBe(true);
  });
});

describe('prepareFlagParts', () => {
  it('returns nothing for non-polygons', () => {
    expect(prepareFlagParts({ type: 'Point', coordinates: [0, 0] })).toEqual([]);
  });

  it('gives a single polygon one cover frame around its bbox', () => {
    const [part] = prepareFlagParts(polygon(square(0, 0, 8, 2)));
    const f = part.frame;
    expect(f.w / f.h).toBeCloseTo(4 / 3);
    expect(f.x).toBeLessThanOrEqual(part.bbox.minX);
    expect(f.x + f.w).toBeGreaterThanOrEqual(part.bbox.maxX - 1e-12);
    expect(f.y).toBeLessThanOrEqual(part.bbox.minY);
    expect(f.y + f.h).toBeGreaterThanOrEqual(part.bbox.maxY - 1e-12);
  });

  it('shares the main frame with parts inside it and frames distant parts separately (France-like)', () => {
    const mainland = square(-5, 42, 8, 51);
    const corsica = square(8.5, 41.4, 9.5, 43);
    const reunion = square(55.2, -21.4, 55.8, -20.9);
    const parts = prepareFlagParts(multi([corsica], [mainland], [reunion]));
    const [pc, pm, pr] = parts;
    expect(pc.frame).toBe(pm.frame);
    expect(pr.frame).not.toBe(pm.frame);
    expect(pr.frame.w).toBeLessThan(pm.frame.w / 5);
    // Réunion's flag covers Réunion
    expect(pr.frame.x).toBeLessThanOrEqual(pr.bbox.minX);
    expect(pr.frame.x + pr.frame.w).toBeGreaterThanOrEqual(pr.bbox.maxX - 1e-12);
  });

  it('gives each far island its own frame (Indonesia-like)', () => {
    const parts = prepareFlagParts(multi([square(95, -5, 105, 5)], [square(130, -8, 131, -7)], [square(140, -3, 141, -2)]));
    expect(new Set(parts.map((p) => p.frame)).size).toBe(3);
  });

  it('keeps a polygon that crosses the antimeridian contiguous', () => {
    const [part] = prepareFlagParts(polygon([[179, -17], [-179, -17], [-179, -16], [179, -16], [179, -17]]));
    expect(part.bbox.maxX - part.bbox.minX).toBeLessThan(0.01);
    expect(part.bbox.maxX).toBeGreaterThan(1);
  });

  it('joins a MultiPolygon split at 180 into one flag (Fiji-like)', () => {
    const east = square(177, -19, 180, -14);
    const west = square(-180, -17, -178.5, -16);
    const parts = prepareFlagParts(multi([east], [west]));
    expect(parts[0].frame).toBe(parts[1].frame);
    // the western part moves one world width east to sit beside the eastern one
    expect(parts[1].bbox.minX).toBeGreaterThanOrEqual(1);
    expect(parts[1].bbox.minX).toBeCloseTo(1, 6);
    expect(parts[1].bbox.maxX).toBeLessThan(parts[0].frame.x + parts[0].frame.w + 1e-9);
  });
});

describe('partsIntersectTile', () => {
  const fiji = prepareFlagParts(multi([square(177, -19, 180, -14)], [square(-180, -17, -178.5, -16)]));

  it('is true for tiles on both sides of the antimeridian and false elsewhere', () => {
    expect(partsIntersectTile(fiji, 0, 0, 0)).toBe(true);
    const lastCol = 2 ** 4 - 1;
    const row = Math.floor(latToWorldY(-17) * 16);
    expect(partsIntersectTile(fiji, 4, lastCol, row)).toBe(true);
    expect(partsIntersectTile(fiji, 4, 0, row)).toBe(true);
    expect(partsIntersectTile(fiji, 4, 8, row)).toBe(false);
    expect(partsIntersectTile(fiji, 4, lastCol, 0)).toBe(false);
  });
});

function recorder() {
  const calls: Array<[string, ...unknown[]]> = [];
  const pattern = { setTransform: vi.fn() };
  const rec = (name: string) => (...args: unknown[]) => { calls.push([name, ...args]); };
  const ctx = {
    save: rec('save'), restore: rec('restore'), beginPath: rec('beginPath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
    closePath: rec('closePath'), clip: rec('clip'), stroke: rec('stroke'), drawImage: rec('drawImage'),
    createPattern: vi.fn(() => pattern),
    lineWidth: 1, lineJoin: 'miter', strokeStyle: '',
  } as unknown as FlagDrawContext;
  return { ctx, calls, pattern, count: (n: string) => calls.filter((c) => c[0] === n).length };
}
const image = { width: 1280, height: 960 } as unknown as CanvasImageSource & { width: number; height: number };

describe('drawFlagTile', () => {
  it('draws nothing and reports false when the tile misses every part', () => {
    const parts = prepareFlagParts(polygon(square(10, 10, 12, 12)));
    const r = recorder();
    expect(drawFlagTile(r.ctx, { z: 2, x: 0, y: 0, tileSize: 512 }, parts, image)).toBe(false);
    expect(r.calls).toEqual([]);
  });

  it('clips with evenodd and draws the flag into the frame in tile pixels', () => {
    const parts = prepareFlagParts(polygon(square(-20, -15, 20, 15)));
    const r = recorder();
    expect(drawFlagTile(r.ctx, { z: 0, x: 0, y: 0, tileSize: 512 }, parts, image)).toBe(true);
    expect(r.calls.find((c) => c[0] === 'clip')).toEqual(['clip', 'evenodd']);
    const draw = r.calls.find((c) => c[0] === 'drawImage')!;
    const f = parts[0].frame;
    expect(draw[2]).toBeCloseTo(f.x * 512);
    expect(draw[3]).toBeCloseTo(f.y * 512);
    expect(draw[4]).toBeCloseTo(f.w * 512);
    expect(draw[5]).toBeCloseTo(f.h * 512);
    // clipped before the image is painted
    const order = r.calls.map((c) => c[0]);
    expect(order.indexOf('clip')).toBeLessThan(order.indexOf('drawImage'));
    expect(order.indexOf('save')).toBe(0);
    expect(order.at(-1)).toBe('restore');
  });

  it('traces every ring so holes cut out under evenodd', () => {
    const parts = prepareFlagParts(polygon(square(-20, -15, 20, 15), square(-5, -5, 5, 5)));
    const r = recorder();
    drawFlagTile(r.ctx, { z: 0, x: 0, y: 0, tileSize: 256 }, parts, image);
    expect(r.count('moveTo')).toBe(2);
    expect(r.count('closePath')).toBe(2);
    expect(r.count('drawImage')).toBe(1);
  });

  it('bleeds past the edge with a flag-patterned stroke aligned to the frame', () => {
    const parts = prepareFlagParts(polygon(square(-20, -15, 20, 15)));
    const r = recorder();
    drawFlagTile(r.ctx, { z: 0, x: 0, y: 0, tileSize: 512 }, parts, image);
    expect(r.count('stroke')).toBe(1);
    const f = parts[0].frame;
    expect(r.pattern.setTransform).toHaveBeenCalledWith(expect.objectContaining({
      a: expect.closeTo((f.w * 512) / 1280, 6),
      e: expect.closeTo(f.x * 512, 6),
    }));
    expect(r.ctx.lineWidth).toBeGreaterThan(1);
  });

  it('works without pattern support', () => {
    const parts = prepareFlagParts(polygon(square(-20, -15, 20, 15)));
    const r = recorder();
    (r.ctx as { createPattern?: unknown }).createPattern = undefined;
    expect(drawFlagTile(r.ctx, { z: 0, x: 0, y: 0, tileSize: 512 }, parts, image)).toBe(true);
    expect(r.count('stroke')).toBe(0);
  });

  it('draws the antimeridian copy on the far side of the world', () => {
    const parts = prepareFlagParts(multi([square(177, -19, 180, -14)], [square(-180, -17, -178.5, -16)]));
    const east = recorder();
    const west = recorder();
    const row = Math.floor(latToWorldY(-17) * 16);
    expect(drawFlagTile(east.ctx, { z: 4, x: 15, y: row, tileSize: 512 }, parts, image)).toBe(true);
    expect(drawFlagTile(west.ctx, { z: 4, x: 0, y: row, tileSize: 512 }, parts, image)).toBe(true);
    // the shared frame starts left of 180 on the east tile and runs off its right edge
    const eastDraw = east.calls.find((c) => c[0] === 'drawImage')!;
    expect(eastDraw[4]).toBe((parts[0].frame.w * 16) * 512);
    const westDraw = west.calls.find((c) => c[0] === 'drawImage')!;
    expect(westDraw[2]).toBeCloseTo((parts[0].frame.x - 1) * 16 * 512, 3);
  });
});

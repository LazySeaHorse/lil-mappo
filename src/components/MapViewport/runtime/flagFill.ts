/**
 * Pure geometry for filling a boundary with a flag: Web Mercator helpers, the cover-fit
 * "frames" the flag is stretched over, antimeridian handling and the per-tile drawing.
 * Nothing here touches Mapbox, so it is unit-tested against a recording 2D context.
 */

export const FLAG_ASPECT_RATIO = 4 / 3;
/** Mercator stops being finite at the poles; Mapbox clamps at this latitude. */
const MAX_LAT = 85.0511287798;
/** How far past a polygon's edge (in tile pixels) the flag is painted so tile and clip edges leave no seam. */
const EDGE_BLEED_PX = 0.75;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A polygon in world coordinates ([0,1] on both axes, y down). */
export interface FlagPart {
  /** Outer ring first, then holes; closed or not. */
  rings: number[][][];
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  /** The rect (world units) the flag is drawn into. Parts sharing a flag share one frame object. */
  frame: Rect;
}

export function lngToWorldX(lng: number): number {
  return (lng + 180) / 360;
}

export function latToWorldY(lat: number): number {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
}

export function worldXToLng(x: number): number {
  return x * 360 - 180;
}

export function worldYToLat(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}

/** World-space extent of tile z/x/y. */
export function tileExtent(z: number, x: number, y: number): Rect {
  const n = 2 ** z;
  return { x: x / n, y: y / n, w: 1 / n, h: 1 / n };
}

/** The smallest 4:3 rect that covers `bbox`, centred on it. */
export function coverFrame(bbox: FlagPart['bbox']): Rect {
  const bw = Math.max(bbox.maxX - bbox.minX, Number.EPSILON);
  const bh = Math.max(bbox.maxY - bbox.minY, Number.EPSILON);
  const w = Math.max(bw, bh * FLAG_ASPECT_RATIO);
  const h = w / FLAG_ASPECT_RATIO;
  return { x: (bbox.minX + bbox.maxX) / 2 - w / 2, y: (bbox.minY + bbox.maxY) / 2 - h / 2, w, h };
}

function ringArea(ring: number[][]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(sum / 2);
}

function partArea(rings: number[][][]): number {
  return rings.reduce((area, ring, index) => area + (index === 0 ? ringArea(ring) : -ringArea(ring)), 0);
}

function ringsBbox(rings: number[][][]): FlagPart['bbox'] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Polygons of the geometry as [lng, lat] rings, each made contiguous across the antimeridian:
 * a polygon whose longitudes span more than half the world has its negative longitudes
 * moved east by 360, so it ends up beyond +180 rather than torn in two.
 */
function polygonParts(geometry: GeoJSON.Geometry): number[][][][] {
  let polygons: number[][][][];
  if (geometry.type === 'Polygon') polygons = [geometry.coordinates];
  else if (geometry.type === 'MultiPolygon') polygons = geometry.coordinates;
  else return [];

  return polygons
    .filter((rings) => rings.length > 0 && rings[0].length >= 3)
    .map((rings) => {
      let minLng = Infinity;
      let maxLng = -Infinity;
      for (const [lng] of rings[0]) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }
      const crosses = maxLng - minLng > 180;
      return rings.map((ring) => ring.map(([lng, lat]) => [crosses && lng < 0 ? lng + 360 : lng, lat]));
    });
}

function insideRect(rect: Rect, px: number, py: number): boolean {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

/**
 * Splits a boundary into parts and decides which flag frame each one is drawn into.
 * The largest part gets a cover-fit frame; parts whose centre lies inside it (a mainland
 * and its nearby islands) share it, so one flag spans the whole group. Distant parts
 * (overseas territories, far islands) get a small cover-fit flag of their own. Parts split
 * at the antimeridian (Fiji, Russia) are moved a world width over when that puts them
 * beside the main part, so they join its flag.
 */
export function prepareFlagParts(geometry: GeoJSON.Geometry): FlagPart[] {
  const worldRings = polygonParts(geometry).map((rings) =>
    rings.map((ring) => ring.map(([lng, lat]) => [lngToWorldX(lng), latToWorldY(lat)])),
  );
  if (worldRings.length === 0) return [];

  let mainIndex = 0;
  let mainArea = -Infinity;
  worldRings.forEach((rings, index) => {
    const area = partArea(rings);
    if (area > mainArea) {
      mainArea = area;
      mainIndex = index;
    }
  });

  const mainBbox = ringsBbox(worldRings[mainIndex]);
  const mainFrame = coverFrame(mainBbox);
  const mainCx = (mainBbox.minX + mainBbox.maxX) / 2;

  return worldRings.map((rings, index): FlagPart => {
    const bbox = ringsBbox(rings);
    if (index === mainIndex) return { rings, bbox, frame: mainFrame };

    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;
    // The wrap offset (-1, 0 or +1 world widths) that puts this part closest to the main one
    let shift = 0;
    for (const candidate of [-1, 1]) {
      if (Math.abs(cx + candidate - mainCx) < Math.abs(cx + shift - mainCx)) shift = candidate;
    }
    if (!insideRect(mainFrame, cx + shift, cy)) return { rings, bbox, frame: coverFrame(bbox) };
    if (shift === 0) return { rings, bbox, frame: mainFrame };
    const shifted = rings.map((ring) => ring.map(([x, y]) => [x + shift, y]));
    return { rings: shifted, bbox: ringsBbox(shifted), frame: mainFrame };
  });
}

/** Whether any part (or its copies one world over) can touch tile z/x/y. */
export function partsIntersectTile(parts: readonly FlagPart[], z: number, x: number, y: number): boolean {
  const tile = tileExtent(z, x, y);
  return parts.some((part) => wrapOffsets(part.bbox, tile).length > 0);
}

/** World-width offsets (-1, 0, 1) at which `bbox` overlaps `tile`. */
function wrapOffsets(bbox: FlagPart['bbox'], tile: Rect): number[] {
  if (bbox.maxY < tile.y || bbox.minY > tile.y + tile.h) return [];
  return [-1, 0, 1].filter((k) => bbox.maxX + k >= tile.x && bbox.minX + k <= tile.x + tile.w);
}

/** The slice of the 2D API the tile drawing uses, so tests can record calls. */
export interface FlagDrawContext {
  save(): void;
  restore(): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  clip(rule: CanvasFillRule): void;
  stroke(): void;
  drawImage(image: CanvasImageSource, x: number, y: number, w: number, h: number): void;
  createPattern?(image: CanvasImageSource, repetition: string | null): CanvasPattern | null;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  strokeStyle: string | CanvasGradient | CanvasPattern;
}

export interface FlagTileSpec {
  z: number;
  x: number;
  y: number;
  tileSize: number;
}

/**
 * Paints the flag into one map tile, clipped to the boundary. Returns false when nothing
 * was drawn (the tile misses every part), so the caller can hand Mapbox `null`.
 */
export function drawFlagTile(
  ctx: FlagDrawContext,
  tile: FlagTileSpec,
  parts: readonly FlagPart[],
  image: CanvasImageSource & { width: number; height: number },
): boolean {
  const extent = tileExtent(tile.z, tile.x, tile.y);
  const scale = tile.tileSize / extent.w;
  let drawn = false;

  for (const part of parts) {
    for (const k of wrapOffsets(part.bbox, extent)) {
      const toPx = (wx: number, wy: number): [number, number] => [(wx + k - extent.x) * scale, (wy - extent.y) * scale];
      const [fx, fy] = toPx(part.frame.x, part.frame.y);
      const fw = part.frame.w * scale;
      const fh = part.frame.h * scale;

      ctx.save();
      ctx.beginPath();
      for (const ring of part.rings) {
        ring.forEach(([wx, wy], i) => {
          const [px, py] = toPx(wx, wy);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
      }
      // A stroke in the flag's own pattern reaches past the edge, so antialiased clip edges
      // of neighbouring tiles meet without a gap
      const pattern = ctx.createPattern?.(image, 'no-repeat');
      if (pattern) {
        const sx = fw / image.width;
        const sy = fh / image.height;
        pattern.setTransform?.({ a: sx, b: 0, c: 0, d: sy, e: fx, f: fy });
        ctx.lineWidth = EDGE_BLEED_PX * 2;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = pattern;
        ctx.stroke();
      }
      ctx.clip('evenodd');
      ctx.drawImage(image, fx, fy, fw, fh);
      ctx.restore();
      drawn = true;
    }
  }
  return drawn;
}

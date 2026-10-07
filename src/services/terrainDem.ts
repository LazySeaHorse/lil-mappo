/**
 * Ground heights from Mapbox's terrain DEM, downloaded once per area and then answered
 * synchronously. Camera planning reads these rather than the map's own terrain, which only
 * knows the tiles the map happens to have loaded, so preview and export plan the same path.
 */

/** Bounds as [west, south, east, north] in degrees. */
export type Bounds = [number, number, number, number];

interface DemTile {
  size: number;
  heights: Float32Array;
}

/** Enough to plan a camera over, without downloading a mountain range for a long flight. */
const MAX_TILES_ACROSS = 4;
const MIN_ZOOM = 2;
const MAX_ZOOM = 12;
const MAX_LAT = 85.05112878;

const tiles = new Map<string, DemTile | null>();
const inFlight = new Map<string, Promise<void>>();
const loadedZooms = new Set<number>();
const listeners = new Set<() => void>();
let version = 0;

const tileKey = (z: number, x: number, y: number) => `${z}/${x}/${y}`;

/** Mapbox Terrain-RGB: height = -10000 + (R·256² + G·256 + B) · 0.1 metres. */
export function decodeTerrainRgb(rgba: ArrayLike<number>, size: number): Float32Array {
  const heights = new Float32Array(size * size);
  for (let i = 0; i < heights.length; i++) {
    heights[i] = -10000 + (rgba[i * 4] * 65536 + rgba[i * 4 + 1] * 256 + rgba[i * 4 + 2]) * 0.1;
  }
  return heights;
}

/** Tile coordinates (fractional) of a point at a zoom level. */
function tileXY(lng: number, lat: number, z: number): [number, number] {
  const scale = 2 ** z;
  const phi = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180;
  const x = (((lng + 180) / 360) % 1 + 1) % 1 * scale;
  const y = ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * scale;
  return [x, y];
}

/** The most detailed zoom at which the bounds span no more than a few tiles each way. */
export function demZoomFor([west, south, east, north]: Bounds): number {
  for (let z = MAX_ZOOM; z > MIN_ZOOM; z--) {
    const [x0, y0] = tileXY(west, north, z);
    const [x1, y1] = tileXY(east, south, z);
    if (Math.floor(x1) - Math.floor(x0) < MAX_TILES_ACROSS && Math.floor(y1) - Math.floor(y0) < MAX_TILES_ACROSS) return z;
  }
  return MIN_ZOOM;
}

export function tilesFor(bounds: Bounds, z: number): [number, number][] {
  const [x0, y0] = tileXY(bounds[0], bounds[3], z).map(Math.floor);
  const [x1, y1] = tileXY(bounds[2], bounds[1], z).map(Math.floor);
  const out: [number, number][] = [];
  const max = 2 ** z - 1;
  for (let x = Math.max(0, x0); x <= Math.min(max, x1); x++) {
    for (let y = Math.max(0, y0); y <= Math.min(max, y1); y++) out.push([x, y]);
  }
  return out;
}

/** Ground height in metres (sea level, unexaggerated), or null where no tile is loaded. */
export function demElevation(lng: number, lat: number): number | null {
  for (let z = MAX_ZOOM; z >= MIN_ZOOM; z--) {
    if (!loadedZooms.has(z)) continue;
    const [tx, ty] = tileXY(lng, lat, z);
    const tile = tiles.get(tileKey(z, Math.floor(tx), Math.floor(ty)));
    if (!tile) continue;
    // Bilinear between pixel centres, held at the tile's edge.
    const { size, heights } = tile;
    const px = Math.max(0, Math.min(size - 1, (tx - Math.floor(tx)) * size - 0.5));
    const py = Math.max(0, Math.min(size - 1, (ty - Math.floor(ty)) * size - 0.5));
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const x1 = Math.min(size - 1, x0 + 1);
    const y1 = Math.min(size - 1, y0 + 1);
    const fx = px - x0;
    const fy = py - y0;
    const top = heights[y0 * size + x0] * (1 - fx) + heights[y0 * size + x1] * fx;
    const bottom = heights[y1 * size + x0] * (1 - fx) + heights[y1 * size + x1] * fx;
    return top * (1 - fy) + bottom * fy;
  }
  return null;
}

/** Bumps whenever tiles arrive, so anything planned on the old answers knows to replan. */
export function demVersion(): number {
  return version;
}

export function onDemLoaded(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function decodeImage(blob: Blob): Promise<DemTile> {
  const bitmap = await createImageBitmap(blob);
  const size = bitmap.width;
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(size, size)
    : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('No 2D canvas to decode terrain');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { size, heights: decodeTerrainRgb(ctx.getImageData(0, 0, size, size).data, size) };
}

async function fetchTile(z: number, x: number, y: number, token: string): Promise<void> {
  const key = tileKey(z, x, y);
  try {
    const res = await fetch(`https://api.mapbox.com/v4/mapbox.mapbox-terrain-dem-v1/${z}/${x}/${y}@2x.pngraw?access_token=${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    tiles.set(key, await decodeImage(await res.blob()));
    loadedZooms.add(z);
  } catch (e) {
    // Remembered as missing so it isn't retried every frame; planning falls back to the map's terrain.
    tiles.set(key, null);
    console.warn(`[terrainDem] tile ${key} failed:`, e);
  }
}

/** Downloads whatever DEM tiles the bounds still need. Resolves once they have all settled. */
export async function loadDem(bounds: Bounds, token: string): Promise<void> {
  if (!token || !bounds.every(Number.isFinite)) return;
  const z = demZoomFor(bounds);
  const waits = tilesFor(bounds, z).map(([x, y]) => {
    const key = tileKey(z, x, y);
    if (tiles.has(key)) return null;
    let pending = inFlight.get(key);
    if (!pending) {
      pending = fetchTile(z, x, y, token).finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
    }
    return pending;
  }).filter((p): p is Promise<void> => p !== null);
  if (waits.length === 0) return;
  await Promise.all(waits);
  version++;
  listeners.forEach((listener) => listener());
}

/** Test hook: forget every tile. */
export function resetDem(): void {
  tiles.clear();
  inFlight.clear();
  loadedZooms.clear();
  version++;
}

/** Test hook: install a tile directly. */
export function putDemTile(z: number, x: number, y: number, tile: DemTile): void {
  tiles.set(tileKey(z, x, y), tile);
  loadedZooms.add(z);
  version++;
}

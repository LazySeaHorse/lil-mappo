/**
 * Where to put a label on an area: the pole of inaccessibility, the point inside the
 * shape that is farthest from its edge (the polylabel idea), not the bounding box centre,
 * which can fall outside a crescent or a coastline-heavy country.
 */

type Ring = number[][];
interface Cell { x: number; y: number; h: number; d: number; max: number }

/** Degrees of precision the search stops at, as a share of the shape's smaller side. */
const PRECISION_SHARE = 0.005;

function segmentDistSq(px: number, py: number, a: number[], b: number[]): number {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}

/** Signed distance to the polygon edge: positive inside, negative outside. */
function pointToPolygonDist(x: number, y: number, rings: Ring[]): number {
  let inside = false;
  let minSq = Infinity;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
      minSq = Math.min(minSq, segmentDistSq(x, y, a, b));
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(minSq);
}

function makeCell(x: number, y: number, h: number, rings: Ring[]): Cell {
  const d = pointToPolygonDist(x, y, rings);
  return { x, y, h, d, max: d + h * Math.SQRT2 };
}

function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += (ring[j][0] - ring[i][0]) * (ring[i][1] + ring[j][1]);
  return Math.abs(sum / 2);
}

function poleOfPolygon(rings: Ring[]): [number, number] | null {
  const outer = rings[0];
  if (!outer || outer.length < 3) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of outer) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const size = Math.min(width, height);
  if (size === 0) return null;
  const precision = size * PRECISION_SHARE;

  let h = size / 2;
  const queue: Cell[] = [];
  for (let x = minX; x < maxX; x += size) {
    for (let y = minY; y < maxY; y += size) queue.push(makeCell(x + h, y + h, h, rings));
  }

  // Start from the bounding box centre, so a simple shape settles there at once.
  let best = makeCell(minX + width / 2, minY + height / 2, 0, rings);
  for (const cell of queue) if (cell.d > best.d) best = cell;

  while (queue.length) {
    // The queue stays short for country outlines, so a scan beats a heap.
    let at = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].max > queue[at].max) at = i;
    const cell = queue.splice(at, 1)[0];
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= precision) continue;
    h = cell.h / 2;
    queue.push(
      makeCell(cell.x - h, cell.y - h, h, rings),
      makeCell(cell.x + h, cell.y - h, h, rings),
      makeCell(cell.x - h, cell.y + h, h, rings),
      makeCell(cell.x + h, cell.y + h, h, rings),
    );
  }
  return [best.x, best.y];
}

/**
 * The visual centre of an area as [lng, lat]; for several polygons, that of the largest.
 * Null when the geometry has no area. Longitude is scaled by cos(latitude) while
 * searching so "farthest from the edge" holds on the ground, not in degrees.
 */
export function labelPoint(geometry: GeoJSON.Geometry | null): [number, number] | null {
  if (!geometry) return null;
  let polygons: Ring[][];
  if (geometry.type === 'Polygon') polygons = [geometry.coordinates];
  else if (geometry.type === 'MultiPolygon') polygons = geometry.coordinates;
  else return null;
  const largest = polygons
    .filter((p) => p[0]?.length >= 3)
    .sort((a, b) => ringArea(b[0]) - ringArea(a[0]))[0];
  if (!largest) return null;

  const midLat = largest[0].reduce((sum, p) => sum + p[1], 0) / largest[0].length;
  const k = Math.max(Math.cos((midLat * Math.PI) / 180), 0.01);
  const flat = largest.map((ring) => ring.map(([x, y]) => [x * k, y]));
  const pole = poleOfPolygon(flat);
  return pole ? [pole[0] / k, pole[1]] : null;
}

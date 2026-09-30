export type BBox = [number, number, number, number]; // [west, south, east, north]

type AnyGeo = GeoJSON.GeoJSON | null | undefined;

function walkCoordinates(value: unknown, visit: (p: number[]) => void): void {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === 'number') {
    visit(value as number[]);
    return;
  }
  for (const child of value) walkCoordinates(child, visit);
}

/** Calls `visit` for every position in any GeoJSON object without building intermediate arrays. */
export function forEachPosition(geo: AnyGeo, visit: (p: number[]) => void): void {
  if (!geo) return;
  switch (geo.type) {
    case 'FeatureCollection':
      for (const f of geo.features) forEachPosition(f, visit);
      break;
    case 'Feature':
      forEachPosition(geo.geometry, visit);
      break;
    case 'GeometryCollection':
      for (const g of geo.geometries) forEachPosition(g, visit);
      break;
    default:
      walkCoordinates((geo as GeoJSON.Point).coordinates, visit);
  }
}

export interface GeoStats {
  /** GeoJSON geometry types present, e.g. ["LineString"]. */
  types: string[];
  pointCount: number;
  bbox: BBox | null;
}

export function geoStats(geo: AnyGeo): GeoStats {
  let pointCount = 0;
  let bbox: BBox | null = null;
  forEachPosition(geo, (p) => {
    const [x, y] = p;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    pointCount++;
    if (!bbox) bbox = [x, y, x, y];
    else {
      if (x < bbox[0]) bbox[0] = x;
      if (y < bbox[1]) bbox[1] = y;
      if (x > bbox[2]) bbox[2] = x;
      if (y > bbox[3]) bbox[3] = y;
    }
  });
  const types = new Set<string>();
  const collect = (g: AnyGeo) => {
    if (!g) return;
    if (g.type === 'FeatureCollection') g.features.forEach(collect);
    else if (g.type === 'Feature') collect(g.geometry);
    else if (g.type === 'GeometryCollection') g.geometries.forEach(collect);
    else types.add(g.type);
  };
  collect(geo);
  return { types: [...types], pointCount, bbox: bbox && (bbox as BBox).map((n) => Math.round(n * 1e4) / 1e4) as BBox };
}

export function unionBBox(boxes: (BBox | null)[]): BBox | null {
  let out: BBox | null = null;
  for (const b of boxes) {
    if (!b) continue;
    out = out
      ? [Math.min(out[0], b[0]), Math.min(out[1], b[1]), Math.max(out[2], b[2]), Math.max(out[3], b[3])]
      : [...b];
  }
  return out;
}

/**
 * GeoJSON sanitizing shared by file import and project loading, so that NaNs,
 * nulls, and malformed coordinates never reach the store or the renderers.
 */

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Validates whether a coordinate tuple is a finite [lng, lat] (and optional finite altitude).
 */
export function isValidCoordinate(coord: unknown): coord is [number, number] | [number, number, number] {
  if (!Array.isArray(coord) || coord.length < 2) return false;
  if (!isFiniteNumber(coord[0]) || !isFiniteNumber(coord[1])) return false;
  return coord.length < 3 || isFiniteNumber(coord[2]);
}

/**
 * Normalizes one position: keeps [lng, lat] when finite, and the altitude only
 * when it is finite too (GPX tracks often have gaps in elevation data).
 * Returns null when the horizontal position itself is unusable.
 */
function sanitizePosition(coord: unknown): number[] | null {
  if (!Array.isArray(coord) || coord.length < 2) return null;
  const [lng, lat, alt] = coord;
  if (!isFiniteNumber(lng) || !isFiniteNumber(lat)) return null;
  return isFiniteNumber(alt) ? [lng, lat, alt] : [lng, lat];
}

/**
 * Sanitizes an array of coordinates, keeping only usable positions.
 */
export function sanitizeLineCoordinates(coords: unknown): number[][] {
  if (!Array.isArray(coords)) return [];
  const valid: number[][] = [];
  for (const c of coords) {
    const position = sanitizePosition(c);
    if (position) valid.push(position);
  }
  return valid;
}

/**
 * Sanitizes multi-line coordinates, dropping empty sub-lines.
 */
export function sanitizeMultiLineCoordinates(coords: unknown): number[][][] {
  if (!Array.isArray(coords)) return [];
  const validLines: number[][][] = [];
  for (const line of coords) {
    const sanitizedLine = sanitizeLineCoordinates(line);
    if (sanitizedLine.length > 0) validLines.push(sanitizedLine);
  }
  return validLines;
}

function sanitizeRings(rings: unknown): number[][][] {
  if (!Array.isArray(rings)) return [];
  const valid: number[][][] = [];
  for (const ring of rings) {
    const sanitizedRing = sanitizeLineCoordinates(ring);
    if (sanitizedRing.length >= 3) valid.push(sanitizedRing);
  }
  return valid;
}

/**
 * Sanitizes a GeoJSON FeatureCollection to prevent null pointer exceptions,
 * NaNs, or corrupted coordinates from reaching the store or renderers.
 */
export function sanitizeFeatureCollection(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  if (!fc || typeof fc !== 'object' || !Array.isArray(fc.features)) {
    return { type: 'FeatureCollection', features: [] };
  }

  const sanitizedFeatures: GeoJSON.Feature[] = [];

  for (const f of fc.features) {
    if (!f || typeof f !== 'object') continue;
    if (!f.geometry || typeof f.geometry !== 'object' || typeof f.geometry.type !== 'string') continue;

    const properties = f.properties || {};
    const geom = f.geometry as GeoJSON.Geometry;
    switch (geom.type) {
      case 'LineString':
        sanitizedFeatures.push({
          ...f,
          properties,
          geometry: { ...geom, coordinates: sanitizeLineCoordinates(geom.coordinates) },
        });
        break;
      case 'MultiLineString':
        sanitizedFeatures.push({
          ...f,
          properties,
          geometry: { ...geom, coordinates: sanitizeMultiLineCoordinates(geom.coordinates) },
        });
        break;
      case 'Point': {
        const position = sanitizePosition(geom.coordinates);
        if (position) sanitizedFeatures.push({ ...f, properties, geometry: { ...geom, coordinates: position } });
        break;
      }
      case 'MultiPoint':
        sanitizedFeatures.push({
          ...f,
          properties,
          geometry: { ...geom, coordinates: sanitizeLineCoordinates(geom.coordinates) },
        });
        break;
      case 'Polygon':
        if (Array.isArray(geom.coordinates)) {
          sanitizedFeatures.push({ ...f, properties, geometry: { ...geom, coordinates: sanitizeRings(geom.coordinates) } });
        }
        break;
      case 'MultiPolygon':
        if (Array.isArray(geom.coordinates)) {
          const polygons = geom.coordinates
            .filter((poly) => Array.isArray(poly))
            .map((poly) => sanitizeRings(poly))
            .filter((rings) => rings.length > 0);
          sanitizedFeatures.push({ ...f, properties, geometry: { ...geom, coordinates: polygons } });
        }
        break;
      default:
        sanitizedFeatures.push({ ...f, properties });
    }
  }

  return { type: 'FeatureCollection', features: sanitizedFeatures };
}

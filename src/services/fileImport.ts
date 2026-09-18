import * as toGeoJSON from '@tmcw/togeojson';

/**
 * Validates whether a coordinate tuple is a finite [lng, lat] (and optional finite altitude).
 */
export function isValidCoordinate(coord: unknown): coord is [number, number] | [number, number, number] {
  if (!Array.isArray(coord) || coord.length < 2) return false;
  const lng = coord[0];
  const lat = coord[1];
  if (typeof lng !== 'number' || !Number.isFinite(lng) || Number.isNaN(lng)) return false;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || Number.isNaN(lat)) return false;
  if (coord.length >= 3) {
    const alt = coord[2];
    if (typeof alt !== 'number' || !Number.isFinite(alt) || Number.isNaN(alt)) {
      return false;
    }
  }
  return true;
}

/**
 * Sanitizes an array of coordinates, keeping only valid finite coordinates.
 */
export function sanitizeLineCoordinates(coords: unknown): number[][] {
  if (!Array.isArray(coords)) return [];
  const valid: number[][] = [];
  for (const c of coords) {
    if (isValidCoordinate(c)) {
      valid.push(c.length >= 3 ? [c[0], c[1], c[2]] : [c[0], c[1]]);
    }
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
    if (sanitizedLine.length > 0) {
      validLines.push(sanitizedLine);
    }
  }
  return validLines;
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
    if (!f.geometry || typeof f.geometry !== 'object' || typeof f.geometry.type !== 'string') {
      continue;
    }

    const geom = f.geometry as GeoJSON.Geometry;
    if (geom.type === 'LineString') {
      const coordinates = sanitizeLineCoordinates((geom as GeoJSON.LineString).coordinates);
      sanitizedFeatures.push({
        ...f,
        properties: f.properties || {},
        geometry: {
          ...geom,
          type: 'LineString',
          coordinates,
        },
      });
    } else if (geom.type === 'MultiLineString') {
      const coordinates = sanitizeMultiLineCoordinates((geom as GeoJSON.MultiLineString).coordinates);
      sanitizedFeatures.push({
        ...f,
        properties: f.properties || {},
        geometry: {
          ...geom,
          type: 'MultiLineString',
          coordinates,
        },
      });
    } else if (geom.type === 'Point') {
      const ptGeom = geom as GeoJSON.Point;
      if (isValidCoordinate(ptGeom.coordinates)) {
        sanitizedFeatures.push({
          ...f,
          properties: f.properties || {},
          geometry: {
            ...geom,
            type: 'Point',
            coordinates: ptGeom.coordinates.length >= 3
              ? [ptGeom.coordinates[0], ptGeom.coordinates[1], ptGeom.coordinates[2]]
              : [ptGeom.coordinates[0], ptGeom.coordinates[1]],
          },
        });
      }
    } else if (geom.type === 'MultiPoint') {
      const coordinates = sanitizeLineCoordinates((geom as GeoJSON.MultiPoint).coordinates);
      sanitizedFeatures.push({
        ...f,
        properties: f.properties || {},
        geometry: {
          ...geom,
          type: 'MultiPoint',
          coordinates,
        },
      });
    } else if (geom.type === 'Polygon') {
      const polyGeom = geom as GeoJSON.Polygon;
      if (Array.isArray(polyGeom.coordinates)) {
        const rings: number[][][] = [];
        for (const ring of polyGeom.coordinates) {
          const sanitizedRing = sanitizeLineCoordinates(ring);
          if (sanitizedRing.length >= 3) {
            rings.push(sanitizedRing);
          }
        }
        sanitizedFeatures.push({
          ...f,
          properties: f.properties || {},
          geometry: {
            ...geom,
            type: 'Polygon',
            coordinates: rings,
          },
        });
      }
    } else if (geom.type === 'MultiPolygon') {
      const mPolyGeom = geom as GeoJSON.MultiPolygon;
      if (Array.isArray(mPolyGeom.coordinates)) {
        const polys: number[][][][] = [];
        for (const poly of mPolyGeom.coordinates) {
          if (!Array.isArray(poly)) continue;
          const rings: number[][][] = [];
          for (const ring of poly) {
            const sanitizedRing = sanitizeLineCoordinates(ring);
            if (sanitizedRing.length >= 3) {
              rings.push(sanitizedRing);
            }
          }
          if (rings.length > 0) polys.push(rings);
        }
        sanitizedFeatures.push({
          ...f,
          properties: f.properties || {},
          geometry: {
            ...geom,
            type: 'MultiPolygon',
            coordinates: polys,
          },
        });
      }
    } else {
      sanitizedFeatures.push({
        ...f,
        properties: f.properties || {},
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features: sanitizedFeatures,
  };
}

function checkXmlErrors(dom: Document, format: string): void {
  const parserErrors = dom.getElementsByTagName('parsererror');
  if (parserErrors.length > 0) {
    const message = parserErrors[0]?.textContent?.trim() || 'XML parsing failed';
    throw new Error(`Invalid ${format}: ${message}`);
  }
  if (dom.documentElement?.tagName?.toLowerCase() === 'parsererror') {
    const message = dom.documentElement.textContent?.trim() || 'XML parsing failed';
    throw new Error(`Invalid ${format}: ${message}`);
  }
}

export function parseKML(text: string): GeoJSON.FeatureCollection {
  if (!text || text.trim().length === 0) {
    throw new Error('KML content is empty');
  }
  if (text.includes('\0')) {
    throw new Error('Binary data is not valid KML');
  }
  const dom = new DOMParser().parseFromString(text, 'text/xml');
  checkXmlErrors(dom, 'KML');
  const geojson = toGeoJSON.kml(dom) as GeoJSON.FeatureCollection;
  return sanitizeFeatureCollection(geojson);
}

export function parseGPX(text: string): GeoJSON.FeatureCollection {
  if (!text || text.trim().length === 0) {
    throw new Error('GPX content is empty');
  }
  if (text.includes('\0')) {
    throw new Error('Binary data is not valid GPX');
  }
  const dom = new DOMParser().parseFromString(text, 'text/xml');
  checkXmlErrors(dom, 'GPX');
  const geojson = toGeoJSON.gpx(dom) as GeoJSON.FeatureCollection;
  return sanitizeFeatureCollection(geojson);
}

export function parseGeoJSON(text: string): GeoJSON.FeatureCollection {
  if (!text || text.trim().length === 0) {
    throw new Error('GeoJSON content is empty');
  }
  if (text.includes('\0')) {
    throw new Error('Binary data is not valid GeoJSON');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Malformed JSON: ${(err as Error).message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid GeoJSON: root must be an object');
  }

  const obj = parsed as Record<string, unknown>;
  let fc: GeoJSON.FeatureCollection;

  if (obj.type === 'FeatureCollection') {
    if (!Array.isArray(obj.features)) {
      throw new Error('Invalid GeoJSON FeatureCollection: features must be an array');
    }
    fc = obj as unknown as GeoJSON.FeatureCollection;
  } else if (obj.type === 'Feature') {
    fc = {
      type: 'FeatureCollection',
      features: [obj as unknown as GeoJSON.Feature],
    };
  } else if (typeof obj.type === 'string' && ['LineString', 'MultiLineString', 'Point', 'MultiPoint', 'Polygon', 'MultiPolygon', 'GeometryCollection'].includes(obj.type)) {
    fc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: obj as unknown as GeoJSON.Geometry,
        },
      ],
    };
  } else {
    throw new Error(`Unsupported or invalid GeoJSON type: ${String(obj.type)}`);
  }

  return sanitizeFeatureCollection(fc);
}

export function importRouteFile(file: File): Promise<{ name: string; geojson: GeoJSON.FeatureCollection }> {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided'));
      return;
    }
    if (file.size === 0) {
      reject(new Error('File is empty (0 bytes)'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        if (!text || text.trim().length === 0) {
          throw new Error('File content is empty');
        }
        const ext = file.name.split('.').pop()?.toLowerCase();
        let geojson: GeoJSON.FeatureCollection;
        if (ext === 'kml') {
          geojson = parseKML(text);
        } else if (ext === 'gpx') {
          geojson = parseGPX(text);
        } else if (ext === 'geojson' || ext === 'json') {
          geojson = parseGeoJSON(text);
        } else {
          // Detect format by inspecting content
          const trimmed = text.trim();
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            geojson = parseGeoJSON(text);
          } else if (trimmed.includes('<kml')) {
            geojson = parseKML(text);
          } else if (trimmed.includes('<gpx')) {
            geojson = parseGPX(text);
          } else {
            throw new Error(`Unsupported file type: .${ext || 'unknown'}`);
          }
        }
        const name = file.name.replace(/\.(kml|gpx|geojson|json)$/i, '');
        resolve({ name, geojson });
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

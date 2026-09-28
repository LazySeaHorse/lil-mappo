import * as toGeoJSON from '@tmcw/togeojson';
import { sanitizeFeatureCollection } from '@/engine/geojsonSanitize';

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

import * as toGeoJSON from '@tmcw/togeojson';
import { sanitizeFeatureCollection } from '@/engine/geojsonSanitize';
import { IMPORTED_ROUTE_TOLERANCE_M, IMPORTED_ROUTE_VERTICAL_TOLERANCE_M, extractLineCoords, optimizeGeometry } from '@/engine/geoUtils';
import { readFitTrack } from '@/engine/fitTrack';
import {
  MAX_ROUTE_FILE_BYTES,
  ROUTE_IMPORT_MESSAGES,
  RouteImportError,
  decodeRouteText,
  detectRouteFormat,
  routeNameOf,
  type RouteFileFormat,
} from './routeFileFormats';
import { ArchiveBudget, ROUTE_ARCHIVE_LIMITS, gunzipRoute, unzipRoutes } from './routeArchives';

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

/**
 * togeojson makes one feature per lap (a marathon auto-lapped every km is about 42 lines). Laps follow
 * each other, so they are joined into one line; a pause inside a lap (a second Track) stays a gap.
 */
function mergeLaps(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  const segments: number[][][] = [];
  fc.features.forEach((f) => {
    const geom = f.geometry;
    const lines = geom?.type === 'LineString' ? [geom.coordinates] : geom?.type === 'MultiLineString' ? geom.coordinates : [];
    lines.forEach((line, i) => {
      if (i === 0 && segments.length > 0) for (const c of line) segments[segments.length - 1].push(c);
      else segments.push([...line]);
    });
  });
  if (segments.length === 0) return { type: 'FeatureCollection', features: [] };
  const geometry: GeoJSON.LineString | GeoJSON.MultiLineString =
    segments.length === 1 ? { type: 'LineString', coordinates: segments[0] } : { type: 'MultiLineString', coordinates: segments };
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry }] };
}

export function parseTCX(text: string): GeoJSON.FeatureCollection {
  if (!text || text.trim().length === 0) {
    throw new Error('TCX content is empty');
  }
  if (text.includes('\0')) {
    throw new Error('Binary data is not valid TCX');
  }
  const dom = new DOMParser().parseFromString(text, 'text/xml');
  checkXmlErrors(dom, 'TCX');
  return mergeLaps(sanitizeFeatureCollection(toGeoJSON.tcx(dom) as GeoJSON.FeatureCollection));
}

export function parseFIT(bytes: Uint8Array): GeoJSON.FeatureCollection {
  const coordinates = readFitTrack(bytes);
  if (coordinates.length === 0) return { type: 'FeatureCollection', features: [] };
  return sanitizeFeatureCollection({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }],
  });
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

export interface ImportedRoute {
  name: string;
  geojson: GeoJSON.FeatureCollection;
  format: RouteFileFormat;
}

/**
 * Geometry only: per-point times, heart rate and the like are never read, and they bloat the saved
 * project. Lines are simplified to {@link IMPORTED_ROUTE_TOLERANCE_M} (altitude to
 * {@link IMPORTED_ROUTE_VERTICAL_TOLERANCE_M}) and rounded to 6 decimals, so a day of 1 Hz
 * recording stays small enough to save and sync.
 */
function cleanImportedRoute(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => ({
      type: 'Feature',
      properties: {},
      geometry: optimizeGeometry(f.geometry, {
        toleranceM: IMPORTED_ROUTE_TOLERANCE_M,
        verticalToleranceM: IMPORTED_ROUTE_VERTICAL_TOLERANCE_M,
        precision: 6,
      }),
    })),
  };
}

function readBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

function parseRouteBytes(bytes: Uint8Array, format: RouteFileFormat): GeoJSON.FeatureCollection {
  switch (format) {
    case 'gpx': return parseGPX(decodeRouteText(bytes));
    case 'kml': return parseKML(decodeRouteText(bytes));
    case 'tcx': return parseTCX(decodeRouteText(bytes));
    case 'geojson': return parseGeoJSON(decodeRouteText(bytes));
    case 'fit': return parseFIT(bytes);
    default: throw new RouteImportError('type', ROUTE_IMPORT_MESSAGES.type);
  }
}

/** One file's bytes to its routes: a track file gives one, a .gz is opened, a zip gives one per route file in it. */
async function routesFromBytes(bytes: Uint8Array, fileName: string, depth: number, budget: ArchiveBudget): Promise<ImportedRoute[]> {
  const format = detectRouteFormat(bytes);
  if (format === 'gzip' || format === 'zip') {
    if (depth >= ROUTE_ARCHIVE_LIMITS.depth) throw new RouteImportError('archive', 'This archive has archives inside archives. Unzip it and pick the files you want.');
    if (format === 'gzip') {
      return routesFromBytes(await gunzipRoute(bytes, budget), routeNameOf(fileName), depth + 1, budget);
    }
    const entries = await unzipRoutes(bytes, fileName, budget);
    const isKmz = /\.kmz$/i.test(fileName);
    const routes: ImportedRoute[] = [];
    let firstError: unknown;
    for (const entry of entries) {
      try {
        routes.push(...(await routesFromBytes(entry.bytes, isKmz ? fileName : entry.name, depth + 1, budget)));
      } catch (err) {
        firstError ??= err;
      }
    }
    if (routes.length === 0) throw firstError ?? new RouteImportError('noTrack', ROUTE_IMPORT_MESSAGES.noTrack);
    return routes;
  }
  if (!format) throw new RouteImportError('type', ROUTE_IMPORT_MESSAGES.type);
  const geojson = cleanImportedRoute(parseRouteBytes(bytes, format));
  if (extractLineCoords(geojson).length < 2) throw new RouteImportError('noTrack', ROUTE_IMPORT_MESSAGES.noTrack);
  return [{ name: routeNameOf(fileName), geojson, format }];
}

export async function importRouteFiles(file: File): Promise<ImportedRoute[]> {
  if (!file || file.size === 0) throw new RouteImportError('empty', ROUTE_IMPORT_MESSAGES.empty);
  if (file.size > MAX_ROUTE_FILE_BYTES) throw new RouteImportError('size', ROUTE_IMPORT_MESSAGES.size);
  return routesFromBytes(await readBytes(file), file.name, 0, new ArchiveBudget());
}

/**
 * What kind of route file some bytes are. Detection reads the content, never the extension or the
 * browser-reported type: phones report odd types (or none) for .fit and .tcx files.
 */

import { isFitFile } from '@/engine/fitTrack';

/** A format that holds a track. */
export type RouteFileFormat = 'gpx' | 'kml' | 'tcx' | 'geojson' | 'fit';
/** A format that wraps other files. */
export type RouteContainerFormat = 'gzip' | 'zip';

export type RouteImportErrorCode = 'empty' | 'size' | 'type' | 'parse' | 'noTrack' | 'archive';

/** A route file that cannot be used; `message` is short and safe to show to the user. */
export class RouteImportError extends Error {
  constructor(readonly code: RouteImportErrorCode, message: string) {
    super(message);
    this.name = 'RouteImportError';
  }
}

export const MAX_ROUTE_FILE_BYTES = 50 * 1024 * 1024;

export const ROUTE_IMPORT_MESSAGES = {
  empty: 'This file is empty.',
  size: 'This file is over 50 MB. Pick a smaller route file.',
  type: 'This is not a route file the map can read. Use GPX, KML, KMZ, TCX, FIT or GeoJSON.',
  noTrack: 'No GPS track in this file. Indoor activities have no route to draw.',
} as const;

/**
 * The route file picker's accept list. iOS and Android grey out files whose extension they do not
 * know when only extensions are listed, so the types are listed too; octet-stream is what a phone
 * calls a .fit. What a file really is gets decided from its bytes, never from this list.
 */
export const ROUTE_FILE_ACCEPT = [
  '.gpx', '.kml', '.kmz', '.tcx', '.fit', '.geojson', '.json', '.zip', '.gz',
  'application/gpx+xml', 'application/vnd.google-earth.kml+xml', 'application/vnd.google-earth.kmz',
  'application/vnd.garmin.tcx+xml', 'application/geo+json', 'application/json', 'application/xml', 'text/xml',
  'application/zip', 'application/gzip', 'application/octet-stream',
].join(',');

const SNIFF_BYTES = 2048;

/** Decodes route-file text, honouring a UTF-8 or UTF-16 byte-order mark (what `readAsText` did). */
export function decodeRouteText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  return new TextDecoder('utf-8').decode(bytes.subarray(bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0));
}

/** The format of a file's bytes, or null when it is none we read. */
export function detectRouteFormat(bytes: Uint8Array): RouteFileFormat | RouteContainerFormat | null {
  // zip: a local file header, or the end record of an empty archive.
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06))) return 'zip';
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return 'gzip';
  if (isFitFile(bytes)) return 'fit';
  const head = decodeRouteText(bytes.subarray(0, SNIFF_BYTES * 2)).slice(0, SNIFF_BYTES).trimStart().toLowerCase();
  if (head.startsWith('{') || head.startsWith('[')) return 'geojson';
  if (head.includes('<gpx')) return 'gpx';
  if (head.includes('<kml')) return 'kml';
  if (head.includes('<trainingcenterdatabase')) return 'tcx';
  return null;
}

/** The route name for a file: its name without a known route extension (and a .gz after it). */
export function routeNameOf(fileName: string): string {
  return fileName.replace(/\.gz$/i, '').replace(/\.(kml|kmz|gpx|tcx|fit|zip|geojson|json)$/i, '') || fileName;
}

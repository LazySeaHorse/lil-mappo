/**
 * Maps raw errors and file names to the low-cardinality enums used in events.
 * Raw messages are never sent: they can contain file names, device details or
 * user content.
 */
import type { ExportErrorClass, ImportErrorClass, ImportFormat, RouteSource } from './events';

export function classifyExportError(err: unknown): ExportErrorClass {
  const name = err instanceof Error ? err.name : '';
  const message = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  if (name === 'QuotaExceededError' || /out of space|ran out|memory|quota|opfs/.test(message)) return 'oom';
  if (/not available in this browser|webcodecs|unsupported|not supported/.test(message)) return 'unsupported';
  if (/videoencoder|h\.264|codec|encoder|muxer/.test(message)) return 'encoder';
  if (/capture|canvas|frame|map runtime|webgl/.test(message)) return 'capture';
  return 'other';
}

/** Route import source from the file extension only (the name itself is never sent). */
export function importSourceOf(fileName: string): Extract<RouteSource, 'import_gpx' | 'import_kml' | 'import_geojson'> {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'gpx') return 'import_gpx';
  if (ext === 'kml') return 'import_kml';
  return 'import_geojson';
}

/** Route import format from the file extension only. */
export function importFormatOf(fileName: string): ImportFormat {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'gpx' || ext === 'kml') return ext;
  if (ext === 'geojson' || ext === 'json') return 'geojson';
  return 'unknown';
}

export function classifyImportError(err: unknown): ImportErrorClass {
  const message = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  if (/empty/.test(message)) return 'empty';
  if (/invalid|malformed|binary|unsupported|not valid/.test(message)) return 'parse';
  return 'other';
}

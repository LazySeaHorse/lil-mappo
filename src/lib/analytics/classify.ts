/**
 * Maps raw errors and file names to the low-cardinality enums used in events.
 * Raw messages are never sent: they can contain file names, device details or
 * user content.
 */
import type { ExportErrorClass, RouteSource } from './events';

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

/**
 * Maps raw errors and file names to the low-cardinality enums used in events.
 * Raw messages are never sent: they can contain file names, device details or
 * user content.
 */
import type { ExportErrorClass, ImportErrorClass, ImportFormat, RouteSource } from './events';
import { errorMessage } from '@/lib/utils';

export function classifyExportError(err: unknown): ExportErrorClass {
  const name = err instanceof Error ? err.name : '';
  const message = errorMessage(err, String(err ?? '')).toLowerCase();
  if (name === 'QuotaExceededError' || /out of space|ran out|memory|quota|opfs/.test(message)) return 'oom';
  if (/not available in this browser|webcodecs|unsupported|not supported/.test(message)) return 'unsupported';
  if (/videoencoder|h\.264|codec|encoder|muxer/.test(message)) return 'encoder';
  if (/capture|canvas|frame|map runtime|webgl/.test(message)) return 'capture';
  return 'other';
}

/** Route import source from the format that was read from the file's bytes. */
export function importSourceOf(format: ImportFormat): Extract<RouteSource, 'import_gpx' | 'import_kml' | 'import_tcx' | 'import_fit' | 'import_geojson'> {
  if (format === 'gpx' || format === 'kml' || format === 'tcx' || format === 'fit') return `import_${format}`;
  return 'import_geojson';
}

/** Route import format guessed from the file extension only, for files that failed before their content was read. */
export function importFormatOf(fileName: string): ImportFormat {
  const ext = fileName.replace(/\.gz$/i, '').split('.').pop()?.toLowerCase();
  if (ext === 'gpx' || ext === 'kml' || ext === 'tcx' || ext === 'fit') return ext;
  if (ext === 'kmz') return 'kml';
  if (ext === 'geojson' || ext === 'json') return 'geojson';
  return 'unknown';
}

export function classifyImportError(err: unknown): ImportErrorClass {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === 'empty' || code === 'noTrack') return 'empty';
  if (code === 'type' || code === 'parse' || code === 'archive') return 'parse';
  const message = errorMessage(err, String(err ?? '')).toLowerCase();
  if (/empty/.test(message)) return 'empty';
  if (/invalid|malformed|binary|unsupported|not valid/.test(message)) return 'parse';
  return 'other';
}

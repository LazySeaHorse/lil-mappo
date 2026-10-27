/**
 * Opens the files that wrap route files: .gz (Strava's .fit.gz), .kmz and small .zip archives
 * (Garmin's "original", Runkeeper). Everything coming out is counted, so a decompression bomb stops
 * part-way instead of filling memory.
 */
import { loadFflate } from '@/lib/lazyModules';
import { RouteImportError } from './routeFileFormats';

export const ROUTE_ARCHIVE_LIMITS = {
  /** How many containers can sit inside each other (zip > gz > gpx is 2). */
  depth: 2,
  /** Entries looked at in one archive. */
  entries: 200,
  /** Route files taken from one archive. */
  routes: 20,
  /** Uncompressed bytes of one file. */
  entryBytes: 100 * 1024 * 1024,
  /** Uncompressed bytes of everything opened for one picked file. */
  totalBytes: 200 * 1024 * 1024,
};

/** Compressed bytes fed per step: one step can grow ~1000x, so this bounds the burst before the next check. */
const GUNZIP_STEP = 16 * 1024;

const ROUTE_ENTRY = /\.(gpx|kml|tcx|fit|geojson|json|gz)$/i;

const fail = (message: string) => new RouteImportError('archive', message);

/** Counts uncompressed bytes across everything opened for one picked file. */
export class ArchiveBudget {
  private used = 0;

  take(bytes: number): void {
    this.used += bytes;
    if (this.used > ROUTE_ARCHIVE_LIMITS.totalBytes) throw fail('This archive expands to more than the map can open. Unzip it and pick the files you want.');
  }
}

const tooLarge = () => fail('A file inside this archive is too large to open.');

export async function gunzipRoute(bytes: Uint8Array, budget: ArchiveBudget): Promise<Uint8Array> {
  const { Gunzip } = await loadFflate();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    const gunzip = new Gunzip((chunk) => {
      size += chunk.length;
      if (size > ROUTE_ARCHIVE_LIMITS.entryBytes) throw tooLarge();
      budget.take(chunk.length);
      chunks.push(chunk);
    });
    for (let i = 0; i < bytes.length; i += GUNZIP_STEP) {
      gunzip.push(bytes.subarray(i, i + GUNZIP_STEP), i + GUNZIP_STEP >= bytes.length);
    }
  } catch (err) {
    if (err instanceof RouteImportError) throw err;
    throw fail('This compressed file is damaged or incomplete.');
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

export interface ArchiveEntry {
  /** The entry's file name without folders. */
  name: string;
  bytes: Uint8Array;
}

/**
 * The route files in a zip. A .kmz keeps its map in doc.kml (or else its first .kml). Entries that are
 * not route files are never decompressed, and sizes are checked from the zip's directory first.
 */
export async function unzipRoutes(bytes: Uint8Array, fileName: string, budget: ArchiveBudget): Promise<ArchiveEntry[]> {
  const { unzipSync } = await loadFflate();
  const isKmz = /\.kmz$/i.test(fileName);
  const candidates: string[] = [];
  let scanned = 0;
  const candidateOf = (name: string) => {
    const base = name.split('/').pop() ?? name;
    return !name.endsWith('/') && !name.startsWith('__MACOSX/') && !base.startsWith('._') && (isKmz ? /\.kml$/i.test(base) : ROUTE_ENTRY.test(base));
  };
  // Pass 1 reads the directory only: nothing is decompressed.
  try {
    unzipSync(bytes, {
      filter: (info) => {
        if (++scanned > ROUTE_ARCHIVE_LIMITS.entries) throw fail('This archive has too many files. Unzip it and pick the ones you want.');
        if (candidateOf(info.name)) candidates.push(info.name);
        return false;
      },
    });
  } catch (err) {
    if (err instanceof RouteImportError) throw err;
    throw fail('This archive is damaged or incomplete.');
  }

  let wanted = candidates;
  if (isKmz) {
    const doc = candidates.find((n) => n.toLowerCase() === 'doc.kml');
    wanted = doc ? [doc] : candidates.slice(0, 1);
  }
  if (wanted.length === 0) throw fail('No route files found in this archive.');
  if (wanted.length > ROUTE_ARCHIVE_LIMITS.routes) {
    throw fail(`This archive has ${wanted.length} routes; unzip it and pick the files you want.`);
  }

  const out: ArchiveEntry[] = [];
  try {
    const want = new Set(wanted);
    // Pass 2 inflates the wanted entries. The declared size is checked first and also caps the output, so an entry that lies is cut short.
    const files = unzipSync(bytes, {
      filter: (info) => {
        if (!want.has(info.name)) return false;
        if (info.originalSize > ROUTE_ARCHIVE_LIMITS.entryBytes) throw tooLarge();
        budget.take(info.originalSize);
        return true;
      },
    });
    for (const name of wanted) {
      const data = files[name];
      if (data) out.push({ name: name.split('/').pop() ?? name, bytes: data });
    }
  } catch (err) {
    if (err instanceof RouteImportError) throw err;
    throw fail('This archive is damaged or incomplete.');
  }
  return out;
}

import {
  BufferTarget,
  StreamTarget,
  type StreamTargetChunk,
  type Target,
} from 'mediabunny';

const EXPORT_DIRECTORY = 'video-export-cache';
const EXPORT_FILE_PREFIX = 'export-';
const STALE_EXPORT_AGE_MS = 24 * 60 * 60 * 1000;
const STREAM_CHUNK_SIZE = 4 * 1024 * 1024;

export interface VideoExportTarget {
  target: Target;
  storage: 'opfs' | 'memory';
  getBlob: () => Promise<Blob>;
  discard: () => Promise<void>;
}

function createMemoryTarget(): VideoExportTarget {
  const target = new BufferTarget();

  return {
    target,
    storage: 'memory',
    getBlob: async () => {
      if (!target.buffer) {
        throw new Error('MP4 muxer finalized without producing output');
      }
      return new Blob([target.buffer], { type: 'video/mp4' });
    },
    discard: async () => undefined,
  };
}

function getExportTimestamp(name: string): number | null {
  if (!name.startsWith(EXPORT_FILE_PREFIX) || !name.endsWith('.mp4')) return null;
  const timestamp = Number(name.slice(EXPORT_FILE_PREFIX.length).split('-', 1)[0]);
  return Number.isFinite(timestamp) ? timestamp : null;
}

async function removeStaleExports(
  directory: FileSystemDirectoryHandle,
  now: number,
): Promise<void> {
  try {
    const iterableDirectory = directory as FileSystemDirectoryHandle & {
      entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
    };
    for await (const [name, handle] of iterableDirectory.entries()) {
      if (handle.kind !== 'file') continue;
      const timestamp = getExportTimestamp(name);
      if (timestamp === null || now - timestamp < STALE_EXPORT_AGE_MS) continue;

      try {
        await directory.removeEntry(name);
      } catch {
        // Cleanup is best-effort; an export in another tab may still hold the file.
      }
    }
  } catch {
    // Some older implementations support OPFS writes but not directory iteration.
  }
}

async function createOpfsTarget(): Promise<VideoExportTarget> {
  const storage = navigator.storage as StorageManager & {
    getDirectory?: () => Promise<FileSystemDirectoryHandle>;
  };
  if (typeof storage?.getDirectory !== 'function') {
    throw new Error('OPFS is unavailable');
  }

  const root = await storage.getDirectory();
  const directory = await root.getDirectoryHandle(EXPORT_DIRECTORY, { create: true });
  const now = Date.now();
  await removeStaleExports(directory, now);

  const randomPart = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) => part.toString(16)).join('');
  const fileName = `${EXPORT_FILE_PREFIX}${now}-${randomPart}.mp4`;
  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  let target: StreamTarget;
  try {
    const writable = await fileHandle.createWritable();
    target = new StreamTarget(
      writable as unknown as WritableStream<StreamTargetChunk>,
      { chunked: true, chunkSize: STREAM_CHUNK_SIZE },
    );
  } catch (error) {
    await directory.removeEntry(fileName).catch(() => undefined);
    throw error;
  }

  return {
    target,
    storage: 'opfs',
    getBlob: async () => fileHandle.getFile(),
    discard: async () => {
      try {
        await directory.removeEntry(fileName);
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
          console.warn('[videoExport] Could not remove temporary OPFS file:', error);
        }
      }
    },
  };
}

/**
 * Creates a disk-backed export target when OPFS is usable. The memory target is
 * retained as a compatibility fallback for older browsers and restricted
 * browsing contexts; the MP4 muxer still uses reserved metadata there to avoid
 * its former second full-file in-memory buffer.
 */
export async function createVideoExportTarget(): Promise<VideoExportTarget> {
  try {
    return await createOpfsTarget();
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error(
        'Browser storage does not have enough space for this export. Free some disk space and try again.',
      );
    }
    console.warn(
      '[videoExport] OPFS is unavailable; using the in-memory compatibility target.',
      error,
    );
    return createMemoryTarget();
  }
}

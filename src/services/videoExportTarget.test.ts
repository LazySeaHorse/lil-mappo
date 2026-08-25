import { BufferTarget, StreamTarget } from 'mediabunny';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVideoExportTarget } from './videoExportTarget';

const originalStorageDescriptor = Object.getOwnPropertyDescriptor(navigator, 'storage');

function installStorage(getDirectory: () => Promise<FileSystemDirectoryHandle>) {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { getDirectory },
  });
}

describe('createVideoExportTarget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalStorageDescriptor) {
      Object.defineProperty(navigator, 'storage', originalStorageDescriptor);
    } else {
      delete (navigator as Navigator & { storage?: StorageManager }).storage;
    }
  });

  it('uses a chunked OPFS stream and returns the completed file', async () => {
    const completedFile = new File(['mp4'], 'temporary.mp4', { type: 'video/mp4' });
    const removeEntry = vi.fn().mockResolvedValue(undefined);
    const writable = new WritableStream();
    const fileHandle = {
      createWritable: vi.fn().mockResolvedValue(writable),
      getFile: vi.fn().mockResolvedValue(completedFile),
    };
    const directory = {
      entries: async function* () {},
      getFileHandle: vi.fn().mockResolvedValue(fileHandle),
      removeEntry,
    };
    const root = {
      getDirectoryHandle: vi.fn().mockResolvedValue(directory),
    };
    installStorage(vi.fn().mockResolvedValue(root as unknown as FileSystemDirectoryHandle));

    const result = await createVideoExportTarget();

    expect(result.storage).toBe('opfs');
    expect(result.target).toBeInstanceOf(StreamTarget);
    expect(root.getDirectoryHandle).toHaveBeenCalledWith('video-export-cache', { create: true });
    expect(directory.getFileHandle).toHaveBeenCalledWith(
      expect.stringMatching(/^export-\d+-.*\.mp4$/),
      { create: true },
    );
    await expect(result.getBlob()).resolves.toBe(completedFile);

    await result.discard();
    expect(removeEntry).toHaveBeenCalledWith(directory.getFileHandle.mock.calls[0][0]);
  });

  it('removes only stale files owned by the export cache', async () => {
    const now = Date.now();
    const staleName = `export-${now - 25 * 60 * 60 * 1000}-old.mp4`;
    const freshName = `export-${now - 60 * 60 * 1000}-fresh.mp4`;
    const removeEntry = vi.fn().mockResolvedValue(undefined);
    const directory = {
      entries: async function* () {
        yield [staleName, { kind: 'file' }];
        yield [freshName, { kind: 'file' }];
        yield ['unrelated.mp4', { kind: 'file' }];
        yield ['export-folder', { kind: 'directory' }];
      },
      getFileHandle: vi.fn().mockResolvedValue({
        createWritable: vi.fn().mockResolvedValue(new WritableStream()),
        getFile: vi.fn(),
      }),
      removeEntry,
    };
    installStorage(vi.fn().mockResolvedValue({
      getDirectoryHandle: vi.fn().mockResolvedValue(directory),
    }));

    await createVideoExportTarget();

    expect(removeEntry).toHaveBeenCalledTimes(1);
    expect(removeEntry).toHaveBeenCalledWith(staleName);
  });

  it('falls back to a memory target when OPFS cannot be opened', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    installStorage(vi.fn().mockRejectedValue(new DOMException('Blocked', 'SecurityError')));

    const result = await createVideoExportTarget();

    expect(result.storage).toBe('memory');
    expect(result.target).toBeInstanceOf(BufferTarget);

    (result.target as BufferTarget).buffer = new Uint8Array([1, 2, 3]).buffer;
    const blob = await result.getBlob();
    expect(blob.type).toBe('video/mp4');
    expect(blob.size).toBe(3);
  });

  it('reports exhausted storage instead of risking a large memory fallback', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    installStorage(vi.fn().mockRejectedValue(
      new DOMException('The quota has been exceeded', 'QuotaExceededError'),
    ));

    await expect(createVideoExportTarget()).rejects.toThrow(
      'Browser storage does not have enough space for this export',
    );
  });

  it('removes a partially created OPFS file before falling back', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const removeEntry = vi.fn().mockResolvedValue(undefined);
    const directory = {
      entries: async function* () {},
      getFileHandle: vi.fn().mockResolvedValue({
        createWritable: vi.fn().mockRejectedValue(new DOMException('Blocked', 'SecurityError')),
      }),
      removeEntry,
    };
    installStorage(vi.fn().mockResolvedValue({
      getDirectoryHandle: vi.fn().mockResolvedValue(directory),
    }));

    const result = await createVideoExportTarget();

    expect(result.storage).toBe('memory');
    expect(removeEntry).toHaveBeenCalledWith(directory.getFileHandle.mock.calls[0][0]);
  });
});

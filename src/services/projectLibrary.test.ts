import { afterEach, describe, expect, it, vi } from 'vitest';

/** Minimal IndexedDB stand-in: an empty store whose requests succeed asynchronously. */
function installFakeIndexedDB() {
  const dbs: Array<{ close: ReturnType<typeof vi.fn>; onversionchange: (() => void) | null; onclose: (() => void) | null }> = [];
  const succeed = <T,>(result: T) => {
    const request = { result, onsuccess: null as null | (() => void), onerror: null };
    queueMicrotask(() => request.onsuccess?.());
    return request;
  };
  const open = vi.fn(() => {
    const db = {
      objectStoreNames: { contains: () => true },
      close: vi.fn(),
      onversionchange: null,
      onclose: null,
      transaction: () => ({ objectStore: () => ({ getAll: () => succeed([]) }) }),
    };
    dbs.push(db);
    return succeed(db);
  });
  vi.stubGlobal('indexedDB', { open });
  return { open, dbs };
}

describe('projectLibrary connection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('opens the database once and reuses the connection', async () => {
    const { open } = installFakeIndexedDB();
    const { listSavedProjects, listProjectDeletions } = await import('./projectLibrary');

    await Promise.all([listSavedProjects(), listProjectDeletions()]);
    await listSavedProjects();

    expect(open).toHaveBeenCalledTimes(1);
  });

  it('closes on versionchange and reopens on the next call', async () => {
    const { open, dbs } = installFakeIndexedDB();
    const { listSavedProjects } = await import('./projectLibrary');

    await listSavedProjects();
    dbs[0].onversionchange?.();
    expect(dbs[0].close).toHaveBeenCalled();

    await listSavedProjects();
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('reopens after the browser closes the connection', async () => {
    const { open, dbs } = installFakeIndexedDB();
    const { listSavedProjects } = await import('./projectLibrary');

    await listSavedProjects();
    dbs[0].onclose?.();
    await listSavedProjects();

    expect(open).toHaveBeenCalledTimes(2);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'user-1' } }) },
}));

let documentPayload: Record<string, unknown> = { id: 'p1', name: 'P' };
vi.mock('@/store/projectDocument', () => ({
  toProjectDocument: () => documentPayload,
  parseProjectDocument: (d: unknown) => d,
}));

import {
  saveProjectToCloud,
  CloudProjectSizeError,
  CloudProjectLimitError,
  CLOUD_PROJECT_MAX_BYTES,
} from './cloudProjectLibrary';

describe('saveProjectToCloud size limits', () => {
  beforeEach(() => {
    rpc.mockReset();
    documentPayload = { id: 'p1', name: 'P' };
  });

  it('throws CloudProjectSizeError from a too_large RPC result', async () => {
    rpc.mockResolvedValue({ data: { error: 'too_large', limit_bytes: 512000, size_bytes: 700000 }, error: null });
    const err = await saveProjectToCloud({} as never).catch((e) => e);
    expect(err).toBeInstanceOf(CloudProjectSizeError);
    expect(err.limitBytes).toBe(512000);
    expect(err.sizeBytes).toBe(700000);
  });

  it('refuses payloads above the hard ceiling without calling the RPC', async () => {
    documentPayload = { id: 'p1', name: 'P', blob: 'x'.repeat(CLOUD_PROJECT_MAX_BYTES + 1) };
    await expect(saveProjectToCloud({} as never)).rejects.toBeInstanceOf(CloudProjectSizeError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('still reports the save-count limit', async () => {
    rpc.mockResolvedValue({ data: { error: 'limit_exceeded', limit: 3 }, error: null });
    await expect(saveProjectToCloud({} as never)).rejects.toBeInstanceOf(CloudProjectLimitError);
  });

  it('resolves on success', async () => {
    rpc.mockResolvedValue({ data: { success: true }, error: null });
    await expect(saveProjectToCloud({} as never, 123)).resolves.toEqual({ updatedAt: 123 });
  });
});

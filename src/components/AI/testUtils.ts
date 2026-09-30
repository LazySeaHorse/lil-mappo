import { vi } from 'vitest';
import { useAuthStore } from '@/store/useAuthStore';
import type { Subscription } from '@/lib/database.types';

export const PRO = { tier: 'wanderer', status: 'active', renewal_date: null } as unknown as Subscription;

export function setSignedIn(signedIn: boolean) {
  useAuthStore.setState({
    user: signedIn ? { id: 'u1', email: 'a@b.c' } : null,
    showAuthModal: false,
    showUpgradeModal: false,
  });
}

export type ModelContextMock = { registerTool: ReturnType<typeof vi.fn>; aborts: AbortSignal[] };

/** Installs a fake native document.modelContext; returns its registration log. */
export function installModelContext(): ModelContextMock {
  const aborts: AbortSignal[] = [];
  const registerTool = vi.fn((_tool: unknown, opts?: { signal?: AbortSignal }) => {
    if (opts?.signal) aborts.push(opts.signal);
  });
  (document as unknown as { modelContext?: unknown }).modelContext = { registerTool };
  return { registerTool, aborts };
}

export function removeModelContext() {
  delete (document as unknown as { modelContext?: unknown }).modelContext;
  delete (navigator as unknown as { modelContext?: unknown }).modelContext;
}

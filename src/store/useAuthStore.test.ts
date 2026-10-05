import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './useAuthStore';

const flushWorkingProjectDraft = vi.hoisted(() => vi.fn());

vi.mock('@/services/workingProjectDraft', () => ({
  flushWorkingProjectDraft,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  },
}));

vi.mock('@/services/checkout', () => ({
  initiateDodoCheckout: vi.fn(),
  storePendingPlan: vi.fn(),
  getPendingPlan: vi.fn(),
  clearPendingPlan: vi.fn(),
  storePendingTopup: vi.fn(),
  getPendingTopup: vi.fn(),
  clearPendingTopup: vi.fn(),
}));

describe('auth modal working-draft handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flushWorkingProjectDraft.mockResolvedValue(undefined);
    useAuthStore.setState({
      showAuthModal: false,
      authModalMode: 'signin',
    });
  });

  it('flushes the current project when sign-in opens', () => {
    useAuthStore.getState().openAuthModal();

    expect(flushWorkingProjectDraft).toHaveBeenCalledOnce();
    expect(useAuthStore.getState()).toMatchObject({
      showAuthModal: true,
      authModalMode: 'signin',
    });
  });

  it('flushes the current project when sign-up opens', () => {
    useAuthStore.getState().openSignupModal();

    expect(flushWorkingProjectDraft).toHaveBeenCalledOnce();
    expect(useAuthStore.getState()).toMatchObject({
      showAuthModal: true,
      authModalMode: 'signup',
    });
  });

  it('keeps the reason from requestSignIn and clears it on a plain open', () => {
    useAuthStore.getState().requestSignIn('Sign in to export your video.');
    expect(useAuthStore.getState()).toMatchObject({
      showAuthModal: true,
      authModalMode: 'signin',
      authModalReason: 'Sign in to export your video.',
    });
    expect(flushWorkingProjectDraft).toHaveBeenCalledOnce();

    useAuthStore.getState().openAuthModal();
    expect(useAuthStore.getState().authModalReason).toBeNull();
  });

  it('drops a stale reason when sign-up opens', () => {
    useAuthStore.getState().requestSignIn('Sign in to export your video.');
    useAuthStore.getState().openSignupModal();
    expect(useAuthStore.getState().authModalReason).toBeNull();
  });
});

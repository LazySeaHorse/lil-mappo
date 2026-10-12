import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './useAuthStore';
import { supabase } from '@/lib/supabase';
import { getPendingPlan, initiateDodoCheckout } from '@/services/checkout';
import { track, trackBeacon } from '@/lib/analytics';
import { trackAnonymous } from '@/lib/analytics/anonymous';

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

vi.mock('@/lib/analytics', () => ({ track: vi.fn(), trackBeacon: vi.fn() }));
vi.mock('@/lib/analytics/anonymous', () => ({ trackAnonymous: vi.fn() }));

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

describe('auth store analytics', () => {
  const alice = { id: 'u1', email: 'a@b.c' };

  beforeEach(() => {
    vi.clearAllMocks();
    flushWorkingProjectDraft.mockResolvedValue(undefined);
    useAuthStore.setState({ user: null, session: null, showUpgradeModal: false });
  });

  it('records which surface opened the upgrade modal for signed-in users', () => {
    useAuthStore.setState({ user: alice });
    useAuthStore.getState().openUpgradeModal('export_limits');
    expect(track).toHaveBeenCalledWith('upgrade_prompt_shown', { where: 'export_limits' });
    expect(trackAnonymous).not.toHaveBeenCalled();
    expect(useAuthStore.getState().showUpgradeModal).toBe(true);
  });

  it('feeds only the anonymous counter when a guest hits an upgrade gate', () => {
    useAuthStore.getState().openUpgradeModal('map_load_gate');
    expect(trackAnonymous).toHaveBeenCalledWith('guest_gate_hit', { where: 'map_load_gate' });
    expect(track).not.toHaveBeenCalled();
    expect(useAuthStore.getState().showUpgradeModal).toBe(true);
  });

  it('counts a guest sign-in gate without sending the reason text', () => {
    useAuthStore.getState().requestSignIn('Sign in to import a route.');
    expect(trackAnonymous).toHaveBeenCalledWith('guest_gate_hit', { where: 'sign_in' });
    useAuthStore.setState({ user: alice });
    vi.mocked(trackAnonymous).mockClear();
    useAuthStore.getState().requestSignIn('Sign in to vote.');
    expect(trackAnonymous).not.toHaveBeenCalled();
  });

  it('sends checkout_started by beacon before redirecting', async () => {
    useAuthStore.setState({ user: alice, session: { access_token: 't' } as never });
    vi.mocked(initiateDodoCheckout).mockResolvedValue(undefined as never);
    await useAuthStore.getState().startCheckout('wanderer');
    expect(trackBeacon).toHaveBeenCalledWith('checkout_started', { plan: 'wanderer', resumed: false });
  });

  it('flags a checkout resumed after sign-in', async () => {
    let listener!: (event: string, session: unknown) => void;
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as never);
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation(((cb: typeof listener) => {
      listener = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }) as never);
    vi.mocked(getPendingPlan).mockReturnValue('wanderer' as never);
    vi.mocked(initiateDodoCheckout).mockResolvedValue(undefined as never);
    useAuthStore.getState().initAuth();
    listener('SIGNED_IN', { access_token: 't', user: { id: 'u1', email: 'a@b.c', user_metadata: {} } });
    expect(trackBeacon).toHaveBeenCalledWith('checkout_started', { plan: 'wanderer', resumed: true });
  });
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  trackAnonymous: vi.fn(),
  attribution: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  initialAuthCallbackType: null,
  supabase: { auth: { signUp: mocks.signUp, signInWithPassword: mocks.signInWithPassword } },
}));
vi.mock('@/lib/analytics/anonymous', () => ({ trackAnonymous: mocks.trackAnonymous }));
vi.mock('@/lib/analytics/attribution', () => ({ getSignupAttribution: mocks.attribution }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useAuthStore } from '@/store/useAuthStore';
import { AuthModal } from './AuthModal';
import { consumeExpectedSignup, expectSignup } from '@/lib/analytics/signupIntent';

/** Reads the flag without consuming it. */
function consumeFlagPeek() {
  const was = consumeExpectedSignup();
  if (was) expectSignup();
  return was;
}

function submit(email: string, password: string) {
  fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: email } });
  fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: password } });
  fireEvent.submit(document.querySelector('form')!);
}

describe('AuthModal anonymous counters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.attribution.mockReturnValue({});
  });

  it('counts a failed sign-in by error class, never the message or email', async () => {
    useAuthStore.setState({ showAuthModal: true, authModalMode: 'signin' });
    mocks.signInWithPassword.mockResolvedValue({ error: Object.assign(new Error('bad creds for a@gmail.com'), { code: 'invalid_credentials' }) });
    render(<AuthModal />);
    submit('a@gmail.com', 'hunter2');
    await waitFor(() => expect(mocks.trackAnonymous).toHaveBeenCalledWith('signin_failed', { error_class: 'invalid_credentials' }));
    expect(JSON.stringify(mocks.trackAnonymous.mock.calls)).not.toContain('a@gmail.com');
  });

  it('counts a blocked domain without calling Supabase', async () => {
    useAuthStore.setState({ showAuthModal: true, authModalMode: 'signup' });
    render(<AuthModal />);
    submit('a@mailinator.com', 'hunter22');
    await waitFor(() => expect(mocks.trackAnonymous).toHaveBeenCalledWith('signup_submitted', { outcome: 'blocked_domain' }));
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it('counts confirm_email and passes attribution in signUp metadata', async () => {
    useAuthStore.setState({ showAuthModal: true, authModalMode: 'signup' });
    mocks.attribution.mockReturnValue({ utm_source: 'news' });
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
    render(<AuthModal />);
    submit('a@gmail.com', 'hunter22');
    await waitFor(() => expect(mocks.trackAnonymous).toHaveBeenCalledWith('signup_submitted', { outcome: 'confirm_email' }));
    expect(mocks.signUp.mock.calls[0][0].options.data).toEqual({ signup_attribution: { utm_source: 'news' } });
  });

  it('omits signup metadata when there is no attribution and classifies signup errors', async () => {
    useAuthStore.setState({ showAuthModal: true, authModalMode: 'signup' });
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: Object.assign(new Error('x'), { code: 'weak_password' }) });
    render(<AuthModal />);
    submit('a@gmail.com', 'hunter22');
    await waitFor(() => expect(mocks.trackAnonymous).toHaveBeenCalledWith('signup_submitted', { outcome: 'error', error_class: 'weak_password' }));
    expect(mocks.signUp.mock.calls[0][0].options).not.toHaveProperty('data');
  });

  it('counts an immediate session (email confirmation off) and flags the new account for signed_up', async () => {
    useAuthStore.setState({ showAuthModal: true, authModalMode: 'signup' });
    mocks.signUp.mockImplementation(async () => {
      // supabase-js emits SIGNED_IN while signUp is still in flight.
      expect(consumeFlagPeek()).toBe(true);
      return { data: { session: { access_token: 't' } }, error: null };
    });
    render(<AuthModal />);
    submit('a@gmail.com', 'hunter22');
    await waitFor(() => expect(mocks.trackAnonymous).toHaveBeenCalledWith('signup_submitted', { outcome: 'signed_in' }));
    expect(consumeExpectedSignup()).toBe(true);
  });

  it('withdraws the new-account flag when confirmation is required or signUp fails', async () => {
    useAuthStore.setState({ showAuthModal: true, authModalMode: 'signup' });
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
    render(<AuthModal />);
    submit('a@gmail.com', 'hunter22');
    await waitFor(() => expect(mocks.trackAnonymous).toHaveBeenCalledWith('signup_submitted', { outcome: 'confirm_email' }));
    expect(consumeExpectedSignup()).toBe(false);
  });

  it('clears a dangling new-account flag when the modal closes, so a later sign-in is not reported as signed_up', async () => {
    useAuthStore.setState({ showAuthModal: true, authModalMode: 'signup' });
    // signUp returns a session but SIGNED_IN never arrives (nothing consumes the flag).
    mocks.signUp.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null });
    render(<AuthModal />);
    submit('a@gmail.com', 'hunter22');
    await waitFor(() => expect(mocks.trackAnonymous).toHaveBeenCalledWith('signup_submitted', { outcome: 'signed_in' }));
    act(() => useAuthStore.setState({ showAuthModal: false }));
    await waitFor(() => expect(document.querySelector('form')).toBeNull());
    expect(consumeExpectedSignup()).toBe(false);
  });
});

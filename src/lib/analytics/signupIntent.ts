/**
 * Tells the analytics bridge that the next SIGNED_IN is a brand-new account.
 *
 * With email confirmation on, the confirmation link's hash marks the signup
 * (see `initialAuthCallbackType`). With confirmation off, `signUp()` returns a
 * session straight away and supabase-js emits SIGNED_IN *while* the call is
 * still in flight, so the flag is raised before calling `signUp` and withdrawn
 * if no session comes back.
 */
let expectedAt: number | null = null;

/**
 * SIGNED_IN arrives during the signUp() call, so an intent older than this is
 * stale (signUp returned a session whose event never came) and must not turn a
 * later plain sign-in into `signed_up`.
 */
export const SIGNUP_INTENT_TTL_MS = 60_000;

export function expectSignup(): void {
  expectedAt = Date.now();
}

export function cancelExpectedSignup(): void {
  expectedAt = null;
}

/** True once per expected signup, and only while the intent is fresh. */
export function consumeExpectedSignup(): boolean {
  const at = expectedAt;
  expectedAt = null;
  return at !== null && Date.now() - at <= SIGNUP_INTENT_TTL_MS;
}

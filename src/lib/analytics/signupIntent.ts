/**
 * Tells the analytics bridge that the next SIGNED_IN is a brand-new account.
 *
 * With email confirmation on, the confirmation link's hash marks the signup
 * (see `initialAuthCallbackType`). With confirmation off, `signUp()` returns a
 * session straight away and supabase-js emits SIGNED_IN *while* the call is
 * still in flight, so the flag is raised before calling `signUp` and withdrawn
 * if no session comes back.
 */
let expected = false;

export function expectSignup(): void {
  expected = true;
}

export function cancelExpectedSignup(): void {
  expected = false;
}

/** True once per expected signup. */
export function consumeExpectedSignup(): boolean {
  const was = expected;
  expected = false;
  return was;
}

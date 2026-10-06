import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIGNUP_INTENT_TTL_MS, cancelExpectedSignup, consumeExpectedSignup, expectSignup } from './signupIntent';

describe('signupIntent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cancelExpectedSignup();
  });
  afterEach(() => vi.useRealTimers());

  it('is consumed exactly once', () => {
    expectSignup();
    expect(consumeExpectedSignup()).toBe(true);
    expect(consumeExpectedSignup()).toBe(false);
  });

  it('can be withdrawn', () => {
    expectSignup();
    cancelExpectedSignup();
    expect(consumeExpectedSignup()).toBe(false);
  });

  it('expires, so a stale intent cannot turn a later sign-in into signed_up', () => {
    expectSignup();
    vi.advanceTimersByTime(SIGNUP_INTENT_TTL_MS + 1);
    expect(consumeExpectedSignup()).toBe(false);
  });

  it('still counts a SIGNED_IN that arrives within the window', () => {
    expectSignup();
    vi.advanceTimersByTime(SIGNUP_INTENT_TTL_MS - 1);
    expect(consumeExpectedSignup()).toBe(true);
  });
});

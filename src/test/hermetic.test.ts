import { describe, expect, it } from 'vitest';

describe('hermetic test environment', () => {
  it('never runs with a PostHog key (so no test can send real events)', () => {
    expect(import.meta.env.VITE_POSTHOG_KEY ?? '').toBe('');
    expect(process.env.VITE_POSTHOG_KEY ?? '').toBe('');
  });
});

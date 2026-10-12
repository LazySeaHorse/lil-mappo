import { describe, it, expect } from 'vitest';
import { errorMessage } from './utils';

describe('errorMessage', () => {
  it('returns an Error message', () => {
    expect(errorMessage(new TypeError('boom'), 'fallback')).toBe('boom');
  });

  it('uses the fallback for non-Error values', () => {
    expect(errorMessage({ code: 1 }, 'Could not cancel')).toBe('Could not cancel');
  });

  it('stringifies non-Error values without a fallback', () => {
    expect(errorMessage('plain')).toBe('plain');
    expect(errorMessage(undefined)).toBe('undefined');
  });
});

import { describe, it, expect } from 'vitest';
import { cn, errorMessage } from './utils';

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

describe('cn', () => {
  it('treats the custom font sizes as sizes, not colors', () => {
    expect(cn('text-micro text-primary')).toBe('text-micro text-primary');
    expect(cn('text-2xs text-muted-foreground')).toBe('text-2xs text-muted-foreground');
    expect(cn('text-xs', 'text-micro')).toBe('text-micro');
  });

  it('merges the named z-index layers', () => {
    expect(cn('z-overlay', 'z-tour')).toBe('z-tour');
  });
});

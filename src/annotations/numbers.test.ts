import { describe, it, expect } from 'vitest';
import { countUp, decimalPlaces, formatCountUp, formatNumber } from './numbers';
import { easeOutCubic } from './motion';

describe('decimalPlaces', () => {
  it('counts fractional digits', () => {
    expect(decimalPlaces(12)).toBe(0);
    expect(decimalPlaces(12.5)).toBe(1);
    expect(decimalPlaces(0.125)).toBe(3);
    expect(decimalPlaces(1e-7)).toBe(7);
    expect(decimalPlaces(1.5e21)).toBe(0);
    expect(decimalPlaces(NaN)).toBe(0);
  });
});

describe('formatNumber', () => {
  it('groups thousands and fixes decimals', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(1234567.891, { decimals: 1 })).toBe('1,234,567.9');
    expect(formatNumber(1234.5, { decimals: 2 })).toBe('1,234.50');
  });

  it('handles negatives and custom or no separators', () => {
    expect(formatNumber(-1234.5, { decimals: 1 })).toBe('-1,234.5');
    expect(formatNumber(-0.001)).toBe('0'); // no "-0"
    expect(formatNumber(1234567, { separator: ' ' })).toBe('1 234 567');
    expect(formatNumber(1234567, { separator: '' })).toBe('1234567');
  });
});

describe('countUp', () => {
  it('interpolates from 0 to the target and lands exactly on it', () => {
    expect(countUp(100, 0)).toBe(0);
    expect(countUp(100, 0.25)).toBe(25);
    expect(countUp(100, 1)).toBe(100);
    expect(countUp(100, 3)).toBe(100);
    expect(countUp(0.1 + 0.2, 1)).toBe(0.1 + 0.2);
  });

  it('supports a start value and an easing', () => {
    expect(countUp(200, 0.5, { from: 100 })).toBe(150);
    expect(countUp(100, 0.5, { ease: easeOutCubic })).toBeGreaterThan(50);
  });
});

describe('formatCountUp', () => {
  it('takes decimals from the target and separates thousands while counting', () => {
    expect(formatCountUp(12345.6, 0)).toBe('0.0');
    expect(formatCountUp(12345.6, 0.5)).toBe('6,172.8');
    expect(formatCountUp(12345.6, 1)).toBe('12,345.6');
    expect(formatCountUp(1500, 0.5)).toBe('750');
  });

  it('lets decimals be overridden', () => {
    expect(formatCountUp(1500, 0.5, { decimals: 1 })).toBe('750.0');
    expect(formatCountUp(2500, 1, { separator: '' })).toBe('2500');
  });
});

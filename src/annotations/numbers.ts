/**
 * Number formatting and count-up for data styles. Formatting is fixed to
 * English conventions (comma thousands, dot decimal) rather than the viewer's
 * locale, so the preview and an export render on another machine agree.
 */

import { clamp01, lerp, type Easing, linear } from './motion';

/** Digits after the decimal point in a number's plain decimal notation (0 for integers). */
export function decimalPlaces(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const [mantissa, exponent] = value.toString().split('e');
  const fraction = mantissa.split('.')[1]?.length ?? 0;
  return Math.max(0, fraction - (exponent ? Number(exponent) : 0));
}

export interface FormatOptions {
  /** Fixed number of decimals. Default 0. */
  decimals?: number;
  /** Thousands separator, or '' for none. Default ','. */
  separator?: string;
}

/** e.g. formatNumber(1234567.891, { decimals: 1 }) === '1,234,567.9'. */
export function formatNumber(value: number, { decimals = 0, separator = ',' }: FormatOptions = {}): string {
  if (!Number.isFinite(value)) return String(value);
  const fixed = Math.abs(value).toFixed(decimals);
  const [integer, fraction] = fixed.split('.');
  const grouped = separator ? integer.replace(/\B(?=(\d{3})+(?!\d))/g, separator) : integer;
  const sign = value < 0 && Number(fixed) !== 0 ? '-' : '';
  return `${sign}${grouped}${fraction ? `.${fraction}` : ''}`;
}

export interface CountUpOptions {
  /** Starting value. Default 0. */
  from?: number;
  ease?: Easing;
}

/** The value a count-up shows at 0–1 progress: exactly `target` at 1. */
export function countUp(target: number, progress: number, { from = 0, ease = linear }: CountUpOptions = {}): number {
  const t = clamp01(progress);
  return t >= 1 ? target : lerp(from, target, ease(t));
}

/**
 * The count-up as text. Decimals follow the target (1234.5 counts with one
 * decimal, so digits don't jump width), and separators are applied throughout.
 */
export function formatCountUp(
  target: number,
  progress: number,
  options: CountUpOptions & Omit<FormatOptions, 'decimals'> & { decimals?: number } = {},
): string {
  const { decimals = decimalPlaces(target), separator, ...count } = options;
  return formatNumber(countUp(target, progress, count), { decimals, separator });
}

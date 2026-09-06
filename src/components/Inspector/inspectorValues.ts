import type { EasingName } from '@/store/types';

export const formatPercent = (value: number) => `${Math.round(value * 100)} %`;
export const formatDegrees = (value: number) => `${(value ?? 0).toFixed(1)}°`;
export const formatMultiplier = (value: number) => `${value.toFixed(1)}x`;
export const formatDecimals = (decimals = 2) => (value: number) => value.toFixed(decimals);

export const EASING_OPTIONS: { value: EasingName; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'easeInOutSine', label: 'Slow start and end' },
  { value: 'easeInQuad', label: 'Slow start' },
  { value: 'easeOutQuad', label: 'Slow end' },
  { value: 'bounce', label: 'Bounce' },
];

export const normalizeEasing = (value?: EasingName): EasingName => {
  if (!value) return 'easeInOutSine';
  if (value === 'easeInOutCubic' || value === 'easeInOutQuad') return 'easeInOutSine';
  if (value === 'easeInCubic') return 'easeInQuad';
  if (value === 'easeOutCubic') return 'easeOutQuad';
  return value;
};

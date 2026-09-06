import { describe, expect, it } from 'vitest';
import {
  parseBoundaryAnimationStyle,
  parseLightPreset,
  parseProjection,
} from './domainValues';

describe('domain value parsers', () => {
  it.each(['globe', 'mercator'] as const)('accepts the %s projection', (value) => {
    expect(parseProjection(value)).toBe(value);
  });

  it.each(['day', 'night', 'dusk', 'dawn'] as const)(
    'accepts the %s light preset',
    (value) => {
      expect(parseLightPreset(value)).toBe(value);
    },
  );

  it.each(['fade', 'draw', 'trace'] as const)(
    'accepts the %s boundary animation style',
    (value) => {
      expect(parseBoundaryAnimationStyle(value)).toBe(value);
    },
  );

  it('rejects unsupported values at UI boundaries', () => {
    expect(() => parseProjection('orthographic')).toThrow('Unsupported projection');
    expect(() => parseLightPreset('midnight')).toThrow('Unsupported light preset');
    expect(() => parseBoundaryAnimationStyle('spin')).toThrow(
      'Unsupported boundary animation style',
    );
  });
});

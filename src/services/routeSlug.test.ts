import { describe, expect, it } from 'vitest';
import { DEFAULT_DEEP_LINK_AUTOCAM, parseAutoCamParam, parseRouteSlug } from './routeSlug';

describe('parseRouteSlug', () => {
  it('parses IATA codes and upper-cases them', () => {
    expect(parseRouteSlug('jfk-to-lhr')).toEqual({ ok: true, from: 'JFK', to: 'LHR' });
  });

  it('is case-insensitive, including the "to" separator', () => {
    expect(parseRouteSlug('JfK-To-lHr')).toEqual({ ok: true, from: 'JFK', to: 'LHR' });
  });

  it('parses ICAO codes, including ones with digits', () => {
    expect(parseRouteSlug('kjfk-to-egll')).toEqual({ ok: true, from: 'KJFK', to: 'EGLL' });
    expect(parseRouteSlug('k1g4-to-lhr')).toEqual({ ok: true, from: 'K1G4', to: 'LHR' });
  });

  it('ignores surrounding whitespace', () => {
    expect(parseRouteSlug('  jfk-to-lhr \n')).toEqual({ ok: true, from: 'JFK', to: 'LHR' });
  });

  it.each([
    '',
    'jfk',
    'jfk-to-',
    '-to-lhr',
    'jfk-lhr',
    'jfk-to-lhr-to-cdg',
    'jf-to-lhr',
    'jfkkk-to-lhr',
    'j1k-to-lhr', // IATA is letters only
    'new-york-to-london',
    'jfk to lhr',
    'jfk-to-lhr/extra',
    'jfk_to_lhr',
  ])('rejects malformed slug %j', (slug) => {
    expect(parseRouteSlug(slug)).toEqual({ ok: false, error: 'malformed' });
  });

  it('rejects null and undefined', () => {
    expect(parseRouteSlug(undefined)).toEqual({ ok: false, error: 'malformed' });
    expect(parseRouteSlug(null)).toEqual({ ok: false, error: 'malformed' });
  });

  it('rejects the same airport on both ends', () => {
    expect(parseRouteSlug('jfk-to-JFK')).toEqual({ ok: false, error: 'same_airport' });
  });
});

describe('parseAutoCamParam', () => {
  it.each(['chase', 'drone', 'reveal', 'topdown'] as const)('accepts %s', (preset) => {
    expect(parseAutoCamParam(preset)).toBe(preset);
    expect(parseAutoCamParam(preset.toUpperCase())).toBe(preset);
  });

  it('defaults to chase when missing or unknown', () => {
    expect(DEFAULT_DEEP_LINK_AUTOCAM).toBe('chase');
    expect(parseAutoCamParam(null)).toBe('chase');
    expect(parseAutoCamParam('')).toBe('chase');
    expect(parseAutoCamParam('top-down')).toBe('chase');
    expect(parseAutoCamParam('nonsense')).toBe('chase');
  });

  it('trims whitespace', () => {
    expect(parseAutoCamParam(' drone ')).toBe('drone');
  });
});

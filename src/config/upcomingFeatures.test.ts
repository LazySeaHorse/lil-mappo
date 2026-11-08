import { describe, expect, it } from 'vitest';
import {
  FEATURE_ID_MAX_LENGTH,
  FEATURE_ID_PATTERN,
  TIER_COPY,
  UPCOMING_FEATURES,
  UPCOMING_FEATURE_IDS,
} from './upcomingFeatures';

describe('upcomingFeatures config', () => {
  it('has unique ids', () => {
    expect(new Set(UPCOMING_FEATURE_IDS).size).toBe(UPCOMING_FEATURES.length);
  });

  it('only uses ids the SQL check constraint accepts', () => {
    for (const id of UPCOMING_FEATURE_IDS) {
      expect(id).toMatch(FEATURE_ID_PATTERN);
      expect(id.length).toBeLessThanOrEqual(FEATURE_ID_MAX_LENGTH);
    }
  });

  it('lists the features people can ask for', () => {
    expect([...UPCOMING_FEATURE_IDS].sort()).toEqual(['cloud-render', 'country-cutouts', 'example-projects', 'google-earth', 'multi-edit-groups', 'overlays']);
  });

  it('has copy for every tier', () => {
    expect(Object.keys(TIER_COPY).sort()).toEqual(['few', 'many', 'most', 'none', 'some']);
  });
});

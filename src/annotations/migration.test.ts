import { describe, it, expect } from 'vitest';
import { migrateCalloutV1ToV2 } from './migration';

describe('migrateCalloutV1ToV2', () => {
  it('migrates legacy callout with altitude > 150 by normalizing to 40px', () => {
    const legacy = {
      id: 'legacy-1',
      title: 'Old High Altitude Marker',
      lngLat: [12.4924, 41.8902],
      altitude: 350, // 350 meters in old schema
      style: { variant: 'standard' },
    };

    const migrated = migrateCalloutV1ToV2(legacy);
    expect(migrated.id).toBe('legacy-1');
    expect(migrated.binding.kind).toBe('geographic');
    if (migrated.binding.kind === 'geographic') {
      expect(migrated.binding.altitude).toBe(40);
    }
  });

  it('preserves reasonable altitude values <= 150px', () => {
    const legacy = {
      id: 'legacy-2',
      title: 'Normal Marker',
      lngLat: [0, 0],
      altitude: 50,
      style: { variant: 'pill' },
    };

    const migrated = migrateCalloutV1ToV2(legacy);
    if (migrated.binding.kind === 'geographic') {
      expect(migrated.binding.altitude).toBe(50);
    }
  });

  it('handles zero or missing altitude', () => {
    const legacy = {
      id: 'legacy-3',
      title: 'Zero Altitude Marker',
      lngLat: [0, 0],
    };

    const migrated = migrateCalloutV1ToV2(legacy);
    if (migrated.binding.kind === 'geographic') {
      expect(migrated.binding.altitude).toBe(0);
    }
  });
});

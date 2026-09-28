import { describe, it, expect } from 'vitest';
import { cameraZoomAt, legacyAltitudeToPixels, migrateCalloutV1ToV2 } from './migration';

describe('legacyAltitudeToPixels', () => {
  it('reproduces the on-screen pole height v1 drew at the given zoom', () => {
    // At the equator and zoom 16, one pixel is ~2.39 m.
    expect(legacyAltitudeToPixels(100, 0, 16)).toBe(42);
    // Same altitude, zoomed out two levels: a quarter of the height.
    expect(legacyAltitudeToPixels(100, 0, 14)).toBe(10);
  });

  it('accounts for latitude like the v1 renderer did', () => {
    expect(legacyAltitudeToPixels(100, 60, 16)).toBe(84);
  });

  it('keeps the 300px cap v1 applied', () => {
    expect(legacyAltitudeToPixels(500, 0, 20)).toBe(300);
  });

  it('returns 0 for missing, zero, negative, or non-finite altitudes', () => {
    expect(legacyAltitudeToPixels(undefined, 0, 16)).toBe(0);
    expect(legacyAltitudeToPixels(0, 0, 16)).toBe(0);
    expect(legacyAltitudeToPixels(-20, 0, 16)).toBe(0);
    expect(legacyAltitudeToPixels(Number.NaN, 0, 16)).toBe(0);
  });
});

describe('cameraZoomAt', () => {
  const kf = (time: number, zoom: number) => ({ time, camera: { zoom } });

  it('interpolates zoom linearly between keyframes', () => {
    expect(cameraZoomAt([kf(0, 10), kf(10, 14)], 5)).toBe(12);
  });

  it('holds the first and last keyframe outside the keyframed range', () => {
    expect(cameraZoomAt([kf(2, 10), kf(4, 14)], 0)).toBe(10);
    expect(cameraZoomAt([kf(2, 10), kf(4, 14)], 9)).toBe(14);
  });

  it('sorts keyframes and ignores malformed ones', () => {
    expect(cameraZoomAt([kf(10, 14), { time: 3 }, kf(0, 10)], 5)).toBe(12);
  });

  it('returns undefined without usable keyframes', () => {
    expect(cameraZoomAt(undefined, 5)).toBeUndefined();
    expect(cameraZoomAt([], 5)).toBeUndefined();
  });
});

describe('migrateCalloutV1ToV2', () => {
  const legacy = {
    kind: 'callout',
    id: 'legacy-1',
    title: 'Colosseum',
    subtitle: '',
    imageUrl: null,
    lngLat: [12.4924, 41.8902],
    anchor: 'bottom',
    startTime: 2,
    endTime: 8,
    animation: { enter: 'scaleUp', exit: 'slideDown', enterDuration: 0.5, exitDuration: 0.25 },
    style: {
      bgColor: '#111111',
      textColor: '#eeeeee',
      accentColor: '#ff0000',
      borderRadius: 6,
      shadow: false,
      maxWidth: 200,
      fontFamily: 'Lexend',
      variant: 'modern',
      showMetadata: true,
    },
    linkTitleToLocation: true,
    altitude: 100,
    poleVisible: false,
    poleColor: '#123456',
  };

  it('maps content, style, timing, transitions, and connector', () => {
    const migrated = migrateCalloutV1ToV2(legacy, 16);
    expect(migrated.styleId).toBe('modern-pill');
    expect(migrated.content.title).toBe('Colosseum');
    expect(migrated.startTime).toBe(2);
    expect(migrated.endTime).toBe(8);
    expect(migrated.transition).toEqual({ enter: 'scale-up', exit: 'slide-down', enterDuration: 0.5, exitDuration: 0.25 });
    expect(migrated.connector.visible).toBe(false);
    expect(migrated.connector.color).toBe('#123456');
    expect(migrated.settings).toMatchObject({ bgColor: '#111111', fontFamily: 'Lexend', shadow: false });
    expect(migrated.linkTitleToLocation).toBe(true);
  });

  it('converts altitude from metres to pixels at the given view zoom', () => {
    const migrated = migrateCalloutV1ToV2(legacy, 16);
    expect(migrated.binding).toEqual({
      kind: 'geographic',
      lngLat: [12.4924, 41.8902],
      altitude: legacyAltitudeToPixels(100, 41.8902, 16),
    });
  });
});

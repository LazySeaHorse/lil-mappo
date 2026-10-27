import { describe, expect, it } from 'vitest';
import { exportBitrate } from './videoBitrate';

describe('exportBitrate', () => {
  it('scales with resolution and frame rate', () => {
    expect(exportBitrate(1920, 1080, 30)).toBe(9_331_200);
    expect(exportBitrate(1920, 1080, 60)).toBe(2 * exportBitrate(1920, 1080, 30));
    expect(exportBitrate(3840, 2160, 30)).toBe(4 * exportBitrate(1920, 1080, 30));
  });

  it('clamps tiny outputs up and oversized ones down', () => {
    expect(exportBitrate(320, 180, 30)).toBe(2_000_000);
    expect(exportBitrate(3840, 2160, 60)).toBe(74_649_600);
    expect(exportBitrate(7680, 4320, 60)).toBe(80_000_000);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { frameZoomOffset, mapZoomOffset, projectFrameWidth } from './frameScale';

const mapOfWidth = (clientWidth: number) => ({
  getContainer: () => ({ clientWidth, clientHeight: clientWidth / 2 }) as HTMLElement,
});

describe('frameZoomOffset', () => {
  it('is how many zoom levels a frame of another width is from the project frame', () => {
    expect(frameZoomOffset(1920, 1920)).toBe(0);
    expect(frameZoomOffset(3840, 1920)).toBe(1);
    expect(frameZoomOffset(960, 1920)).toBe(-1);
  });

  it('is 0 without a size to compare', () => {
    expect(frameZoomOffset(0, 1920)).toBe(0);
    expect(frameZoomOffset(1920, 0)).toBe(0);
  });
});

describe('mapZoomOffset', () => {
  afterEach(() => useProjectStore.setState({ frameWidth: 1920 }));

  it('zooms a map narrower than the project frame out, so it shows the same ground', () => {
    useProjectStore.setState({ frameWidth: 1920 });
    expect(mapZoomOffset(mapOfWidth(1194))).toBeCloseTo(Math.log2(1194 / 1920));
    expect(mapZoomOffset(mapOfWidth(1920))).toBe(0);
  });

  it('leaves a project from before the frame width was stored as the map shows it', () => {
    useProjectStore.setState({ frameWidth: null });
    expect(projectFrameWidth(mapOfWidth(1440))).toBe(1440);
    expect(mapZoomOffset(mapOfWidth(1440))).toBe(0);
  });
});

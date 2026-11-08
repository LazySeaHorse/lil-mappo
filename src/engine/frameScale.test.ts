import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { frameZoomOffset, mapFrameSize, mapZoomOffset, projectFrameWidth } from './frameScale';

const mapOfSize = (clientWidth: number, clientHeight: number) => ({
  getContainer: () => ({ clientWidth, clientHeight }) as HTMLElement,
});
/** A map shaped like the 16:9 video, as fit mode shapes it. */
const mapOfWidth = (clientWidth: number) => mapOfSize(clientWidth, (clientWidth * 9) / 16);

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

describe('mapFrameSize', () => {
  afterEach(() => useProjectStore.setState({ resolution: [1920, 1080] }));

  it('is the whole map when the map is shaped like the video', () => {
    useProjectStore.setState({ resolution: [1920, 1080] });
    expect(mapFrameSize(mapOfSize(1600, 900))).toEqual({ width: 1600, height: 900 });
  });

  it('is the largest rectangle of the video\'s shape that fits a map of another shape', () => {
    useProjectStore.setState({ resolution: [1920, 1080] });
    // Zen mode on a wide window: the frame fits the height, with map either side.
    expect(mapFrameSize(mapOfSize(2000, 900))).toEqual({ width: 1600, height: 900 });
    // A tall window: the frame fits the width, with map above and below.
    expect(mapFrameSize(mapOfSize(900, 1600))).toEqual({ width: 900, height: 506.25 });
    // A vertical video in a landscape window fits the height.
    useProjectStore.setState({ resolution: [1080, 1920] });
    expect(mapFrameSize(mapOfSize(1600, 900))).toEqual({ width: 506.25, height: 900 });
  });
});

describe('mapZoomOffset', () => {
  beforeEach(() => useProjectStore.setState({ resolution: [1920, 1080] }));
  afterEach(() => useProjectStore.setState({ frameWidth: 1920 }));

  it('zooms a map narrower than the project frame out, so it shows the same ground', () => {
    useProjectStore.setState({ frameWidth: 1920 });
    expect(mapZoomOffset(mapOfWidth(1194))).toBeCloseTo(Math.log2(1194 / 1920));
    expect(mapZoomOffset(mapOfWidth(1920))).toBe(0);
  });

  it('measures a map wider than the video by the frame that fits it, not its whole width', () => {
    useProjectStore.setState({ frameWidth: 1920 });
    expect(mapZoomOffset(mapOfSize(3840, 1080))).toBe(0);
  });

  it('leaves a project from before the frame width was stored as the map shows it', () => {
    useProjectStore.setState({ frameWidth: null });
    expect(projectFrameWidth(mapOfWidth(1440))).toBe(1440);
    expect(mapZoomOffset(mapOfWidth(1440))).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { PANEL_GAP, PANEL_MARGIN, RIGHT_RESERVED_DESKTOP } from '@/constants/layout';
import { fitCard, fitFrame } from './viewFit';

const desktop = { isMobile: false, isTablet: false };
const container = { width: 1600, height: 900 };

describe('fitCard', () => {
  it('is the whole free area between the panels, with the inspector reserved', () => {
    const card = fitCard(container, desktop, 200)!;
    expect(card.x).toBe(PANEL_MARGIN);
    expect(card.y).toBe(PANEL_MARGIN + 56 + PANEL_GAP);
    expect(card.x + card.width).toBe(container.width - RIGHT_RESERVED_DESKTOP);
    expect(card.y + card.height).toBe(container.height - (200 + PANEL_MARGIN + PANEL_GAP));
  });

  it('has the same centre as the frame, which is the map centre', () => {
    const card = fitCard(container, desktop, 200)!;
    const frame = fitFrame(container, 16 / 9, desktop, 200)!;
    expect(frame.x + frame.width / 2).toBeCloseTo(card.x + card.width / 2);
    expect(frame.y + frame.height / 2).toBeCloseTo(card.y + card.height / 2);
  });
});

describe('fitFrame', () => {
  it('is the largest rectangle with the video aspect ratio in the space between the panels', () => {
    const frame = fitFrame(container, 16 / 9, desktop, 200)!;
    const freeW = container.width - PANEL_MARGIN - RIGHT_RESERVED_DESKTOP;
    const freeH = container.height - (PANEL_MARGIN + 56 + PANEL_GAP) - (200 + PANEL_MARGIN + PANEL_GAP);
    expect(frame.width / frame.height).toBeCloseTo(16 / 9);
    // The height of the free area is what limits a 16:9 frame here, so it is filled exactly.
    expect(frame.height).toBeCloseTo(freeH);
    expect(frame.width).toBeLessThanOrEqual(freeW + 1e-9);
    expect(frame.x).toBeGreaterThanOrEqual(PANEL_MARGIN);
    expect(frame.x + frame.width).toBeLessThanOrEqual(container.width - RIGHT_RESERVED_DESKTOP + 1e-9);
  });

  it('is limited by width for a tall free area, and centred in the free area', () => {
    const frame = fitFrame({ width: 1000, height: 1400 }, 16 / 9, desktop, 200)!;
    const freeW = 1000 - PANEL_MARGIN - RIGHT_RESERVED_DESKTOP;
    expect(frame.width).toBeCloseTo(freeW);
    const freeTop = PANEL_MARGIN + 56 + PANEL_GAP;
    const freeH = 1400 - freeTop - (200 + PANEL_MARGIN + PANEL_GAP);
    expect(frame.y + frame.height / 2).toBeCloseTo(freeTop + freeH / 2);
  });

  it('follows a vertical video', () => {
    const frame = fitFrame(container, 9 / 16, desktop, 200)!;
    expect(frame.height).toBeGreaterThan(frame.width);
    expect(frame.width / frame.height).toBeCloseTo(9 / 16);
  });

  it('always leaves room for the inspector, open or not', () => {
    const frame = fitFrame(container, 4 / 3, desktop, 200)!;
    expect(frame.x + frame.width).toBeLessThanOrEqual(container.width - RIGHT_RESERVED_DESKTOP + 1e-9);
  });

  it('has no frame without a size or aspect ratio', () => {
    expect(fitFrame({ width: 0, height: 0 }, 16 / 9, desktop, 200)).toBeNull();
    expect(fitFrame(container, NaN, desktop, 200)).toBeNull();
    expect(fitFrame(container, 0, desktop, 200)).toBeNull();
  });
});

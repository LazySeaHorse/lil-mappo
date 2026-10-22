import { afterEach, describe, expect, it } from 'vitest';
import { PANEL_GAP, PANEL_MARGIN, RIGHT_RESERVED_DESKTOP } from '@/constants/layout';
import { fitFrame, fitView } from './viewFit';
import { getViewOffset, getViewPadding, NO_FIT_VIEW, setViewFit, toProjectZoom, toViewZoom } from './viewOffset';

const desktop = { isMobile: false, isTablet: false };
const container = { width: 1600, height: 900 };

afterEach(() => setViewFit(NO_FIT_VIEW));

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

describe('fitView', () => {
  it('zooms out by log2 of the frame width over the container width', () => {
    const frame = { x: 100, y: 100, width: 800, height: 450 };
    expect(fitView(container, frame).offset).toBeCloseTo(Math.log2(0.5));
    expect(fitView(container, { x: 0, y: 0, width: 1600, height: 900 }).offset).toBe(0);
  });

  it('pads so the centre of the padded area is the frame centre', () => {
    const frame = fitFrame(container, 16 / 9, desktop, 200)!;
    const { padding } = fitView(container, frame);
    expect((padding.left + container.width - padding.right) / 2).toBeCloseTo(frame.x + frame.width / 2);
    expect((padding.top + container.height - padding.bottom) / 2).toBeCloseTo(frame.y + frame.height / 2);
    // One side of each axis only.
    expect(Math.min(padding.left, padding.right)).toBe(0);
    expect(Math.min(padding.top, padding.bottom)).toBe(0);
  });

  it('shows what full screen exports: the frame is the export crop scaled by 2^offset', () => {
    const aspect = 16 / 9;
    const frame = fitFrame(container, aspect, desktop, 200)!;
    const { offset } = fitView(container, frame);
    // Full screen exports the container's width, cropped to this height.
    const fullHeight = container.width / aspect;
    expect(fullHeight * 2 ** offset).toBeCloseTo(frame.height);
    expect(container.width * 2 ** offset).toBeCloseTo(frame.width);
  });
});

describe('view offset', () => {
  it('converts between map zoom and project zoom', () => {
    expect(toProjectZoom(7)).toBe(7);
    setViewFit({ offset: -1.5, padding: NO_FIT_VIEW.padding });
    expect(getViewOffset()).toBe(-1.5);
    expect(toProjectZoom(7)).toBe(8.5);
    expect(toViewZoom(8.5)).toBe(7);
    setViewFit(NO_FIT_VIEW);
    expect(getViewOffset()).toBe(0);
    expect(getViewPadding()).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });
});

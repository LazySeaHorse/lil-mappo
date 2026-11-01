import { describe, expect, it } from 'vitest';
import { DEFAULT_ASPECT, PHONE_OUTER, fitAspect, stageLayout } from './layout';

describe('fitAspect', () => {
  it('letterboxes a 16:9 stage top and bottom in a taller viewport', () => {
    expect(fitAspect(1440, 900, 16 / 9)).toEqual({ left: 0, top: 45, width: 1440, height: 810 });
  });

  it('pillarboxes a portrait stage left and right in a wide viewport', () => {
    expect(fitAspect(1600, 900, 9 / 16)).toEqual({ left: 547, top: 0, width: 506, height: 900 });
  });

  it('fills the viewport exactly when the aspects match', () => {
    expect(fitAspect(1920, 1080, 16 / 9)).toEqual({ left: 0, top: 0, width: 1920, height: 1080 });
  });

  it('falls back to 16:9 for a missing or broken aspect', () => {
    const expected = fitAspect(1000, 1000, DEFAULT_ASPECT);
    expect(fitAspect(1000, 1000, 0)).toEqual(expected);
    expect(fitAspect(1000, 1000, Number.NaN)).toEqual(expected);
    expect(fitAspect(1000, 1000, -2)).toEqual(expected);
  });

  it('never goes negative in an empty viewport', () => {
    expect(fitAspect(0, 0, 16 / 9)).toEqual({ left: 0, top: 0, width: 0, height: 0 });
  });
});

describe('stageLayout', () => {
  it('fills a landscape stage inside one gutter', () => {
    const l = stageLayout(1600, 900, 16 / 9, false);
    expect(l.portrait).toBe(false);
    expect(l.margin).toBe(41);
    expect(l.app).toEqual({ left: 41, top: 41, width: 1518, height: 818 });
  });

  it('puts the terminal on the left and narrows the app window beside it', () => {
    const l = stageLayout(1600, 900, 16 / 9, true);
    expect(l.terminal.left).toBe(l.margin);
    expect(l.app.left).toBe(l.terminal.left + l.terminal.width + l.margin);
    expect(l.app.left + l.app.width).toBe(1600 - l.margin);
    expect(l.app.height).toBe(l.terminal.height);
  });

  it('centres a phone at the largest scale that fits a portrait stage', () => {
    const l = stageLayout(506, 900, 9 / 16, false);
    expect(l.portrait).toBe(true);
    expect(l.app.width).toBeLessThanOrEqual(506 - l.margin * 2);
    expect(l.app.height).toBeLessThanOrEqual(900 - l.margin * 2);
    expect(Math.round(l.app.width / l.phoneScale)).toBe(PHONE_OUTER.width);
    expect(l.app.left * 2 + l.app.width).toBeCloseTo(506, -1);
  });

  it('shrinks the phone below the terminal when the AI panel opens in portrait', () => {
    const closed = stageLayout(506, 900, 9 / 16, false);
    const open = stageLayout(506, 900, 9 / 16, true);
    expect(open.phoneScale).toBeLessThan(closed.phoneScale);
    expect(open.app.top).toBeGreaterThanOrEqual(open.terminal.top + open.terminal.height + open.margin);
    expect(open.app.top + open.app.height).toBeLessThanOrEqual(900 - open.margin);
  });
});

import { describe, expect, it } from 'vitest';
import { BAR_HEIGHT, DEFAULT_ASPECT, PHONE_EDGE, PHONE_OUTER, PHONE_SCREEN, STATUS_HEIGHT, appViewportBox, fitAspect, frameToStage, stageLayout } from './layout';

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

describe('frameToStage', () => {
  it('puts a landscape frame under the window bar, at true size', () => {
    const layout = stageLayout(1600, 900, 16 / 9, false);
    expect(appViewportBox(layout)).toEqual({ left: layout.app.left, top: layout.app.top + BAR_HEIGHT, width: layout.app.width, height: layout.app.height - BAR_HEIGHT });
    expect(frameToStage(layout, { x: 10, y: 20, width: 300, height: 100 })).toEqual({
      left: layout.app.left + 10,
      top: layout.app.top + BAR_HEIGHT + 20,
      width: 300,
      height: 100,
    });
  });

  it('follows the app window when the AI panel narrows it', () => {
    const layout = stageLayout(1600, 900, 16 / 9, true);
    expect(frameToStage(layout, { x: 0, y: 0, width: 1, height: 1 }).left).toBe(layout.app.left);
    expect(layout.app.left).toBeGreaterThan(layout.margin);
  });

  it('scales a phone frame and offsets it by the edge and the status bar', () => {
    const layout = stageLayout(500, 900, 9 / 16, false);
    const s = layout.phoneScale;
    const box = frameToStage(layout, { x: 100, y: 200, width: 40, height: 80 });
    expect(box.left).toBeCloseTo(layout.app.left + (PHONE_EDGE + 100) * s);
    expect(box.top).toBeCloseTo(layout.app.top + (PHONE_EDGE + STATUS_HEIGHT + 200) * s);
    expect(box.width).toBeCloseTo(40 * s);
    expect(box.height).toBeCloseTo(80 * s);
  });

  it('maps the whole phone frame onto the app viewport box', () => {
    const layout = stageLayout(500, 900, 9 / 16, false);
    const vp = appViewportBox(layout);
    const full = frameToStage(layout, { x: 0, y: 0, width: PHONE_SCREEN.width, height: PHONE_SCREEN.height - STATUS_HEIGHT });
    expect(full.left).toBeCloseTo(vp.left);
    expect(full.top).toBeCloseTo(vp.top);
    expect(full.width).toBeCloseTo(vp.width);
    expect(full.height).toBeCloseTo(vp.height);
  });
});

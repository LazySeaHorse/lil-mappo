import { describe, expect, it } from 'vitest';
import { BAR_HEIGHT, DEFAULT_ASPECT, PHONE_EDGE, PHONE_OUTER, PHONE_SCREEN, STATUS_HEIGHT, DIVIDER, SHARE_THIRD, appViewportBox, fitAspect, frameToStage, layoutKey, stageLayout } from './layout';

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

  it('takes a quarter of the free width for the terminal by default, a third on request', () => {
    const quarter = stageLayout(1600, 900, 16 / 9, true);
    expect(quarter.terminal.width).toBe(Math.round((1518 - 41) * 0.25));
    const third = stageLayout(1600, 900, 16 / 9, true, { terminalShare: SHARE_THIRD });
    expect(third.terminal.width).toBe(Math.round((1518 - 41) / 3));
    expect(third.app.left + third.app.width).toBe(1600 - third.margin);
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

describe('stageLayout in full screen', () => {
  it('fills the stage edge to edge with the app alone', () => {
    const l = stageLayout(1600, 900, 16 / 9, false, { fullScreen: true });
    expect(l).toMatchObject({ fullScreen: true, margin: 0, app: { left: 0, top: 0, width: 1600, height: 900 } });
  });

  it('splits at a quarter: terminal left, a thin divider, the app right', () => {
    const l = stageLayout(1600, 900, 16 / 9, true, { fullScreen: true });
    expect(l.terminal).toEqual({ left: 0, top: 0, width: Math.round((1600 - DIVIDER) * 0.25), height: 900 });
    expect(l.app.left).toBe(l.terminal.width + DIVIDER);
    expect(l.app.left + l.app.width).toBe(1600);
    expect(l.app.height).toBe(900);
    expect(l.divider).toBe(DIVIDER);
  });

  it('splits at a third', () => {
    const l = stageLayout(1500, 900, 16 / 9, true, { fullScreen: true, terminalShare: SHARE_THIRD });
    expect(l.terminal.width).toBe(Math.round((1500 - DIVIDER) / 3));
    expect(l.app.left + l.app.width).toBe(1500);
  });

  it('ignores full screen on a portrait stage', () => {
    expect(stageLayout(506, 900, 9 / 16, true, { fullScreen: true, terminalShare: SHARE_THIRD })).toEqual(stageLayout(506, 900, 9 / 16, true));
    expect(stageLayout(506, 900, 9 / 16, true).fullScreen).toBe(false);
  });

  it('keeps the browser toolbar above the app viewport', () => {
    const l = stageLayout(1600, 900, 16 / 9, true, { fullScreen: true });
    expect(appViewportBox(l)).toEqual({ left: l.app.left, top: BAR_HEIGHT, width: l.app.width, height: 900 - BAR_HEIGHT });
    expect(frameToStage(l, { x: 10, y: 20, width: 30, height: 40 })).toEqual({ left: l.app.left + 10, top: BAR_HEIGHT + 20, width: 30, height: 40 });
  });
});

describe('layoutKey', () => {
  const stage = { width: 1600, height: 900 };
  const key = (aiOpen: boolean, options = {}, s = stage) => layoutKey(stageLayout(s.width, s.height, 16 / 9, aiOpen, options), s);

  it('is stable for the same layout', () => {
    expect(key(true)).toBe(key(true));
  });

  it('changes with the window size, the AI panel, full screen and the split', () => {
    const base = key(true);
    expect(key(true, {}, { width: 1280, height: 720 })).not.toBe(base);
    expect(key(false)).not.toBe(base);
    expect(key(true, { fullScreen: true })).not.toBe(base);
    expect(key(true, { terminalShare: SHARE_THIRD })).not.toBe(base);
    expect(key(false, { fullScreen: true })).not.toBe(key(false));
  });
});

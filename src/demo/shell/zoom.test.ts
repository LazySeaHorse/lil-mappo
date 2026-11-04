import { describe, expect, it } from 'vitest';
import {
  HYSTERESIS_MARGIN,
  IDENTITY_VIEW,
  IDLE_MS,
  INITIAL_DIRECTOR,
  TRANSITION_MS,
  WIDE_MAX_ZOOM,
  cameraView,
  clampView,
  directFocus,
  directIdle,
  idleDelay,
  terminalView,
  viewForRegion,
  viewStyle,
  visibleBox,
  type DirectorState,
  type ZoomSpace,
} from './zoom';

const stage = { width: 1600, height: 900 };
const space: ZoomSpace = { stage, viewport: { left: 72, top: 110, width: 1456, height: 718 }, maxZoom: 1.8 };

/** A region of w x h whose top left is at (left, top). */
const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

describe('clampView', () => {
  it('never shows outside the stage', () => {
    expect(clampView({ scale: 2, x: 50, y: 50 }, stage)).toEqual({ scale: 2, x: 0, y: 0 });
    expect(clampView({ scale: 2, x: -9999, y: -9999 }, stage)).toEqual({ scale: 2, x: -1600, y: -900 });
  });

  it('is the whole stage at scale 1 or below', () => {
    expect(clampView({ scale: 0.5, x: -30, y: 12 }, stage)).toEqual(IDENTITY_VIEW);
  });
});

describe('viewForRegion: fit', () => {
  it('zooms to fit a panel with padding, capped at the max zoom', () => {
    const panel = box(1200, 300, 300, 300);
    const view = viewForRegion(IDENTITY_VIEW, panel, 'work', { ...space, maxZoom: 2.5 });
    // 300 tall + 12 % padding each side = 372 -> 900 / 372
    expect(view.scale).toBeCloseTo(900 / (300 * 1.24), 3);
    const small = viewForRegion(IDENTITY_VIEW, box(1000, 300, 200, 150), 'work', space);
    expect(small.scale).toBe(1.8);
  });

  it('grows a lone control to a minimum region instead of filling the screen with it', () => {
    const button = box(800, 400, 40, 30);
    const view = viewForRegion(IDENTITY_VIEW, button, 'work', space);
    expect(view.scale).toBe(1.8);
    const vis = visibleBox(view, stage);
    expect(vis.left + vis.width / 2).toBeCloseTo(820, 0);
    expect(vis.top + vis.height / 2).toBeCloseTo(415, 0);
  });

  it('caps a wide strip at a gentle zoom', () => {
    const view = viewForRegion(IDENTITY_VIEW, box(72, 700, 1456, 120), 'wide', space);
    expect(view.scale).toBeLessThanOrEqual(WIDE_MAX_ZOOM);
    expect(view.scale).toBeGreaterThanOrEqual(1);
  });

  it('does not bother with a zoom of a few percent', () => {
    expect(viewForRegion(IDENTITY_VIEW, box(1200, 120, 300, 700), 'work', space)).toEqual(IDENTITY_VIEW);
  });

  it('keeps the camera at 1x for a region that fills the stage', () => {
    expect(viewForRegion(IDENTITY_VIEW, box(72, 110, 1456, 718), 'work', space)).toEqual(IDENTITY_VIEW);
  });

  it('clamps the pan so the stage stays covered', () => {
    const corner = viewForRegion(IDENTITY_VIEW, box(0, 0, 100, 100), 'work', space);
    expect(corner.x).toBe(0);
    expect(corner.y).toBe(0);
    const far = viewForRegion(IDENTITY_VIEW, box(1500, 800, 100, 100), 'work', space);
    expect(far.x).toBeCloseTo(1600 * (1 - far.scale));
    expect(far.y).toBeCloseTo(900 * (1 - far.scale));
  });
});

describe('viewForRegion: hysteresis', () => {
  const settled = viewForRegion(IDENTITY_VIEW, box(1000, 300, 200, 150), 'work', space);

  it('does not move for a region comfortably inside the visible area', () => {
    const vis = visibleBox(settled, stage);
    const inside = box(vis.left + vis.width * 0.3, vis.top + vis.height * 0.3, 100, 80);
    expect(viewForRegion(settled, inside, 'work', space)).toBe(settled);
  });

  it('pans, keeping the scale, when the region leaves the visible area', () => {
    const vis = visibleBox(settled, stage);
    const outside = box(vis.left - 200, vis.top + 100, 200, 150);
    const moved = viewForRegion(settled, outside, 'work', space);
    expect(moved.scale).toBe(settled.scale);
    expect(moved.x).toBeGreaterThan(settled.x);
  });

  it('counts a region at the visible edge as leaving it', () => {
    const vis = visibleBox(settled, stage);
    const edge = box(vis.left + vis.width * (HYSTERESIS_MARGIN / 2), vis.top + vis.height * 0.3, 100, 80);
    expect(viewForRegion(settled, edge, 'work', space)).not.toBe(settled);
  });

  it('keeps a slightly smaller scale when panning, but takes a very different one', () => {
    const current = { scale: 1.7, x: -500, y: -200 };
    const kept = viewForRegion(current, box(100, 100, 150, 120), 'work', space);
    expect(kept.scale).toBe(1.7);
    const wide = viewForRegion(current, box(72, 700, 1456, 120), 'wide', space);
    expect(wide.scale).toBeLessThanOrEqual(WIDE_MAX_ZOOM);
  });

  it('zooms in from 1x when the region is visible but worth magnifying', () => {
    expect(viewForRegion(IDENTITY_VIEW, box(900, 300, 200, 150), 'work', space).scale).toBe(1.8);
  });
});

describe('director: events and idle', () => {
  const focused = directFocus(INITIAL_DIRECTOR, { region: box(1000, 300, 200, 150), intent: 'work' }, 1000, space);

  it('records when the last focus came', () => {
    expect(focused.lastFocusAt).toBe(1000);
    expect(focused.view.scale).toBe(1.8);
  });

  it('refreshes the idle timer even when the camera stays put', () => {
    const again = directFocus(focused, { region: box(1050, 330, 60, 40), intent: 'work' }, 2200, space);
    expect(again.view).toBe(focused.view);
    expect(again.lastFocusAt).toBe(2200);
  });

  it('eases back to 1x after the idle delay', () => {
    expect(idleDelay(focused, 1000)).toBe(IDLE_MS);
    expect(idleDelay(focused, 2000)).toBe(IDLE_MS - 1000);
    expect(directIdle(focused, 1000 + IDLE_MS - 1)).toBe(focused);
    expect(directIdle(focused, 1000 + IDLE_MS)).toEqual(INITIAL_DIRECTOR);
  });

  it('has nothing to wait for at 1x', () => {
    expect(idleDelay(INITIAL_DIRECTOR, 5000)).toBeNull();
  });

  it('zooms out at once on a null focus', () => {
    expect(directFocus(focused, { region: null, intent: 'work' }, 1200, space)).toEqual(INITIAL_DIRECTOR);
  });

  it('is a pure function of its input', () => {
    const state: DirectorState = { view: { scale: 1.5, x: -100, y: -50 }, lastFocusAt: 10 };
    const copy = JSON.stringify(state);
    directFocus(state, { region: box(0, 0, 10, 10), intent: 'work' }, 20, space);
    expect(JSON.stringify(state)).toBe(copy);
  });
});

describe('terminalView', () => {
  it('magnifies the terminal column beside the app and shows its top', () => {
    const terminal = box(72, 72, 560, 756);
    const view = terminalView(terminal, space);
    expect(view.scale).toBeGreaterThan(1.5);
    const vis = visibleBox(view, stage);
    expect(vis.left).toBeLessThanOrEqual(terminal.left);
    expect(vis.left + vis.width).toBeGreaterThanOrEqual(terminal.left + terminal.width);
    expect(vis.top).toBeCloseTo(0);
  });

  it('stays at 1x for a terminal as wide as the stage (portrait)', () => {
    expect(terminalView(box(40, 40, 1520, 300), space)).toEqual(IDENTITY_VIEW);
  });
});

describe('viewStyle', () => {
  it('has no transform at 1x and a translate-scale otherwise', () => {
    expect(viewStyle(IDENTITY_VIEW, { speed: 1, instant: false }).transform).toBe('none');
    expect(viewStyle({ scale: 1.5, x: -100, y: -40 }, { speed: 1, instant: false }).transform).toBe('translate(-100.00px, -40.00px) scale(1.5000)');
  });

  it('divides the duration by the speed, and snaps when instant', () => {
    expect(viewStyle(IDENTITY_VIEW, { speed: 1, instant: false }).transitionDuration).toBe(`${TRANSITION_MS}ms`);
    expect(viewStyle(IDENTITY_VIEW, { speed: 2, instant: false }).transitionDuration).toBe(`${TRANSITION_MS / 2}ms`);
    expect(viewStyle(IDENTITY_VIEW, { speed: 2, instant: true }).transitionDuration).toBe('0ms');
  });
});

describe('cameraView', () => {
  const terminal = box(72, 72, 560, 756);
  const director = directFocus(INITIAL_DIRECTOR, { region: box(1000, 300, 200, 150), intent: 'work' }, 0, space);
  const input = { autoZoom: true, mockAi: false, aiTyping: false, director, terminal, space };

  it('follows the director in normal mode', () => {
    expect(cameraView(input)).toBe(director.view);
  });

  it('is the whole stage with auto zoom off, even mid-zoom', () => {
    expect(cameraView({ ...input, autoZoom: false })).toEqual(IDENTITY_VIEW);
  });

  it('looks at the terminal while the prompt is typed, then never zooms again in AI mode', () => {
    const typing = cameraView({ ...input, mockAi: true, aiTyping: true });
    expect(typing.scale).toBeGreaterThan(1.5);
    expect(cameraView({ ...input, mockAi: true, aiTyping: false })).toEqual(IDENTITY_VIEW);
  });
});

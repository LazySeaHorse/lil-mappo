import { afterEach, describe, expect, it } from 'vitest';
import { focusFor, focusOn, focusOut, withFocusOut, type DemoFocus } from './focus';
import { click, moveTo } from './actions';
import { testContext } from './testContext';

/** jsdom lays nothing out: give an element the box it should have. */
function box(el: Element, left: number, top: number, width: number, height: number): void {
  el.getBoundingClientRect = () =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
}

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  return document.body;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('focusFor: which region a control belongs to', () => {
  it('is the inspector section for a control inside one', () => {
    mount(`<div data-walkthrough="inspector-panel"><section data-section="boundary-style"><button id="b">x</button></section></div>`);
    box(document.getElementById('b')!, 950, 200, 30, 20);
    box(document.querySelector('[data-section]')!, 900, 150, 280, 300);
    box(document.querySelector('[data-walkthrough="inspector-panel"]')!, 900, 100, 300, 700);
    expect(focusFor(document.getElementById('b')!)).toEqual({ rect: { x: 900, y: 150, width: 280, height: 300 }, intent: 'work' });
  });

  it('only counts the part of a section the panel shows', () => {
    mount(`<div data-walkthrough="inspector-panel"><section data-section="boundary-style"><button id="b">x</button></section></div>`);
    box(document.querySelector('[data-section]')!, 900, 600, 280, 400);
    box(document.querySelector('[data-walkthrough="inspector-panel"]')!, 900, 100, 300, 700);
    expect(focusFor(document.getElementById('b')!)?.rect).toEqual({ x: 900, y: 600, width: 280, height: 200 });
  });

  it('is the inspector panel for a control outside any section', () => {
    mount(`<div data-walkthrough="inspector-panel"><input id="i" /></div>`);
    box(document.querySelector('[data-walkthrough]')!, 900, 100, 300, 700);
    expect(focusFor(document.getElementById('i')!)?.rect).toEqual({ x: 900, y: 100, width: 300, height: 700 });
  });

  it('is the dialog for the export modal, and the panel for the Plan Route menu', () => {
    mount(`<div role="dialog"><button id="d">x</button></div><div role="menu"><input id="m" /></div>`);
    box(document.querySelector('[role="dialog"]')!, 300, 100, 600, 500);
    box(document.querySelector('[role="menu"]')!, 20, 60, 320, 480);
    expect(focusFor(document.getElementById('d')!)?.rect).toEqual({ x: 300, y: 100, width: 600, height: 500 });
    expect(focusFor(document.getElementById('m')!)?.rect).toEqual({ x: 20, y: 60, width: 320, height: 480 });
  });

  it('is the timeline strip, with a wide intent', () => {
    mount(`<div data-walkthrough="timeline-panel"><div id="clip"></div></div>`);
    box(document.querySelector('[data-walkthrough]')!, 0, 600, 1200, 200);
    expect(focusFor(document.getElementById('clip')!)).toEqual({ rect: { x: 0, y: 600, width: 1200, height: 200 }, intent: 'wide' });
  });

  it('is the control itself when it belongs to no region (toolbar)', () => {
    mount(`<button id="t">Add</button>`);
    box(document.getElementById('t')!, 100, 10, 40, 36);
    expect(focusFor(document.getElementById('t')!)?.rect).toEqual({ x: 100, y: 10, width: 40, height: 36 });
  });

  it('clips to the window and gives nothing for an element with no size', () => {
    mount(`<div role="dialog"><button id="d">x</button></div><button id="gone">y</button>`);
    box(document.querySelector('[role="dialog"]')!, 1000, 700, 600, 500);
    expect(focusFor(document.getElementById('d')!)?.rect).toEqual({ x: 1000, y: 700, width: 200, height: 100 });
    box(document.getElementById('gone')!, 0, 0, 0, 0);
    expect(focusFor(document.getElementById('gone')!)).toBeNull();
  });
});

describe('reporting focus through the context', () => {
  function withReporter() {
    const ctx = testContext();
    const seen: DemoFocus[] = [];
    ctx.focus = (f) => seen.push(f);
    return { ctx, seen };
  }

  it('moveTo and click report the control\'s region', async () => {
    mount(`<div data-walkthrough="inspector-panel"><section data-section="route-style"><button id="b" aria-label="Go">x</button></section></div>`);
    box(document.getElementById('b')!, 950, 200, 30, 20);
    box(document.querySelector('[data-section]')!, 900, 150, 280, 300);
    box(document.querySelector('[data-walkthrough]')!, 900, 100, 300, 700);
    const { ctx, seen } = withReporter();
    await moveTo(ctx, document.getElementById('b')!);
    expect(seen).toEqual([{ rect: { x: 900, y: 150, width: 280, height: 300 }, intent: 'work' }]);
    await click(ctx, { role: 'button', name: 'Go' });
    expect(seen).toHaveLength(2);
  });

  it('does not need a reporter', async () => {
    mount(`<button id="b">x</button>`);
    box(document.getElementById('b')!, 10, 10, 20, 20);
    await expect(moveTo(testContext(), document.getElementById('b')!)).resolves.toBeTruthy();
  });

  it('withFocusOut asks for the whole stage, mutes the primitives inside, and frees them after', async () => {
    mount(`<button id="b">x</button>`);
    box(document.getElementById('b')!, 10, 10, 20, 20);
    const { ctx, seen } = withReporter();
    await withFocusOut(ctx, async () => {
      await moveTo(ctx, document.getElementById('b')!);
      await withFocusOut(ctx, async () => focusOn(ctx, document.getElementById('b')!));
      focusOn(ctx, document.getElementById('b')!);
    });
    expect(seen).toEqual([{ rect: null, intent: 'work' }, { rect: null, intent: 'work' }]);
    await moveTo(ctx, document.getElementById('b')!);
    expect(seen).toHaveLength(3);
    expect(seen[2].rect).not.toBeNull();
  });

  it('frees the primitives again when the wrapped work throws', async () => {
    const { ctx } = withReporter();
    await expect(withFocusOut(ctx, async () => { throw new Error('x'); })).rejects.toThrow();
    expect(ctx.focusHold).toBe(0);
  });

  it('focusOut reports a null rect', () => {
    const { ctx, seen } = withReporter();
    focusOut(ctx);
    expect(seen).toEqual([{ rect: null, intent: 'work' }]);
  });
});

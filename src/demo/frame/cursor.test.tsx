import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoClock } from './clock';
import { CursorController, cursorKindFor, travelDuration, travelPoint } from './cursor';
import { DemoCursor } from './DemoCursor';

describe('cursorKindFor', () => {
  const make = (html: string) => {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    return host;
  };
  afterEach(() => { document.body.innerHTML = ''; });

  it('shows the I-beam over text fields, the hand over controls, and the arrow elsewhere', () => {
    const host = make(`
      <input id="text" type="text" />
      <textarea id="area"></textarea>
      <button id="btn"><span id="inner">Add</span></button>
      <div role="switch" id="switch"></div>
      <button id="off" disabled>Off</button>
      <p id="plain">Words</p>
    `);
    const q = (id: string) => host.querySelector(`#${id}`);
    expect(cursorKindFor(q('text'))).toBe('ibeam');
    expect(cursorKindFor(q('area'))).toBe('ibeam');
    expect(cursorKindFor(q('inner'))).toBe('hand');
    expect(cursorKindFor(q('switch'))).toBe('hand');
    expect(cursorKindFor(q('off'))).toBe('pointer');
    expect(cursorKindFor(q('plain'))).toBe('pointer');
    expect(cursorKindFor(null)).toBe('pointer');
  });
});

describe('travel path', () => {
  const from = { x: 0, y: 0 };
  const to = { x: 400, y: 0 };

  it('starts and ends on the two points', () => {
    expect(travelPoint(from, to, 0)).toEqual(from);
    expect(travelPoint(from, to, 1)).toEqual(to);
  });

  it('bows off the straight line in the middle and eases in and out', () => {
    const mid = travelPoint(from, to, 0.5);
    expect(Math.abs(mid.y)).toBeGreaterThan(10);
    // Eased: a tenth of the time covers less than a tenth of the way.
    expect(travelPoint(from, to, 0.1).x).toBeLessThan(40);
  });

  it('takes longer across the screen than for a short hop, and no time for no move', () => {
    expect(travelDuration(from, { x: 40, y: 0 }, 600)).toBeLessThan(travelDuration(from, { x: 1200, y: 0 }, 600));
    expect(travelDuration(from, from, 600)).toBe(0);
  });
});

describe('CursorController and DemoCursor', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('draws above the page without taking pointer events and follows the controller', async () => {
    const controller = new CursorController({ x: 10, y: 20 });
    render(<DemoCursor controller={controller} />);
    const el = screen.getByTestId('demo-cursor');
    expect(el.parentElement).toBe(document.body);
    expect(el).toHaveClass('demo-cursor');
    expect(el.style.transform).toBe('translate3d(10px, 20px, 0)');

    controller.setKind('hand');
    controller.setPressed(true);
    expect(el.dataset.kind).toBe('hand');
    expect(el.dataset.pressed).toBe('true');

    controller.setHidden(true);
    expect(el.dataset.hidden).toBe('true');
  });

  it('travels over clock time and lands exactly on the target', async () => {
    const clock = new DemoClock({ now: () => Date.now() });
    const controller = new CursorController({ x: 0, y: 0 });
    const done = controller.travel({ x: 300, y: 100 }, 500, clock, 'ibeam');
    await vi.advanceTimersByTimeAsync(250);
    expect(controller.position.x).toBeGreaterThan(0);
    expect(controller.position.x).toBeLessThan(300);
    await vi.advanceTimersByTimeAsync(300);
    await done;
    expect(controller.position).toEqual({ x: 300, y: 100 });
    expect(controller.kind).toBe('ibeam');
  });
});

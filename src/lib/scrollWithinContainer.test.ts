import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scrollWithinContainer } from './scrollWithinContainer';

function rect(top: number, height: number, left = 0, width = 100): DOMRect {
  return { top, bottom: top + height, left, right: left + width, height, width, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

/** A scroll box with a fixed layout: `viewport` tall, `content` scrollable height. */
function scrollBox(parent: HTMLElement, { top, viewport, content, overflowY = 'auto' }: { top: number; viewport: number; content: number; overflowY?: string }) {
  const box = document.createElement('div');
  box.style.overflowY = overflowY;
  box.getBoundingClientRect = () => rect(top, viewport);
  Object.defineProperty(box, 'clientHeight', { value: viewport, configurable: true });
  Object.defineProperty(box, 'scrollHeight', { value: content, configurable: true });
  box.scrollTo = vi.fn() as never;
  parent.appendChild(box);
  return box;
}

describe('scrollWithinContainer', () => {
  let scrollIntoView: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView as never;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('centres the element in its scroll box without scrollIntoView', () => {
    const box = scrollBox(document.body, { top: 100, viewport: 200, content: 1000 });
    const el = document.createElement('div');
    el.getBoundingClientRect = () => rect(500, 40); // 400px below the box top
    box.appendChild(el);

    expect(scrollWithinContainer(el, { block: 'center' })).toBe(true);
    // 400 below the box top, minus half of the spare room (200 - 40) / 2.
    expect(box.scrollTo).toHaveBeenCalledWith({ top: 320, left: 0, behavior: 'smooth' });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('aligns to the start, and stays within the scroll range', () => {
    const box = scrollBox(document.body, { top: 0, viewport: 200, content: 300 });
    const el = document.createElement('div');
    el.getBoundingClientRect = () => rect(250, 40);
    box.appendChild(el);

    scrollWithinContainer(el, { block: 'start', behavior: 'auto' });
    expect(box.scrollTo).toHaveBeenCalledWith({ top: 100, left: 0, behavior: 'auto' });
  });

  it('moves every scroll box in turn, using where the inner scroll puts the element', () => {
    const outer = scrollBox(document.body, { top: 0, viewport: 300, content: 2000 });
    const inner = scrollBox(outer, { top: 400, viewport: 100, content: 400 });
    const el = document.createElement('div');
    el.getBoundingClientRect = () => rect(450, 20);
    inner.appendChild(el);

    scrollWithinContainer(el, { block: 'center' });
    // Inner: 50 below its top, minus (100 - 20) / 2.
    expect(inner.scrollTo).toHaveBeenCalledWith({ top: 10, left: 0, behavior: 'smooth' });
    // The element is then at 440 in the outer box, which centres it at 440 - (300 - 20) / 2.
    expect(outer.scrollTo).toHaveBeenCalledWith({ top: 300, left: 0, behavior: 'smooth' });
  });

  it('leaves a box that already shows the element, and a box that cannot scroll', () => {
    const box = scrollBox(document.body, { top: 0, viewport: 200, content: 1000 });
    const hidden = scrollBox(box, { top: 0, viewport: 200, content: 1000, overflowY: 'hidden' });
    const el = document.createElement('div');
    el.getBoundingClientRect = () => rect(80, 40);
    hidden.appendChild(el);

    expect(scrollWithinContainer(el, { block: 'nearest' })).toBe(false);
    expect(box.scrollTo).not.toHaveBeenCalled();
    expect(hidden.scrollTo).not.toHaveBeenCalled();
  });

  it('does nothing when no scroll box surrounds the element', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    expect(scrollWithinContainer(el)).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

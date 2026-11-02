type Align = 'start' | 'center' | 'nearest';

export interface ScrollWithinOptions {
  /** Where the element ends up along the vertical axis (default `center`). */
  block?: Align;
  /** Where the element ends up along the horizontal axis (default `nearest`). */
  inline?: Align;
  behavior?: ScrollBehavior;
}

const SCROLLS = /^(auto|scroll|overlay)$/;

/**
 * Where a scroll box has to be scrolled to for the element to sit at `align`,
 * given the element's and the box's edges on one axis (all in viewport pixels).
 */
function targetOffset(scroll: number, align: Align, elStart: number, elSize: number, boxStart: number, boxSize: number) {
  const startDelta = elStart - boxStart;
  if (align === 'start') return scroll + startDelta;
  if (align === 'center') return scroll + startDelta - (boxSize - elSize) / 2;
  const endDelta = startDelta + elSize - boxSize;
  if (startDelta < 0 && endDelta < 0) return scroll + Math.max(startDelta, endDelta);
  if (startDelta > 0 && endDelta > 0) return scroll + Math.min(startDelta, endDelta);
  return scroll;
}

/**
 * `el.scrollIntoView()` that stays inside the element's own document: it moves
 * only the scroll boxes between the element and the document root, never the
 * window, and never an ancestor in a parent document when the page is framed
 * (`scrollIntoView` chains into the parent of a same-origin iframe, and an
 * `overflow: hidden` box up there can still be scrolled programmatically).
 *
 * Returns whether any scroll box was asked to move.
 */
export function scrollWithinContainer(el: Element, { block = 'center', inline = 'nearest', behavior = 'smooth' }: ScrollWithinOptions = {}) {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  const rect = el.getBoundingClientRect();
  // Scrolling a box moves the element by the distance the box really moved.
  let top = rect.top;
  let left = rect.left;
  let moved = false;

  for (let node = el.parentElement; node && node !== el.ownerDocument.body && node !== el.ownerDocument.documentElement; node = node.parentElement) {
    const style = view.getComputedStyle(node);
    const scrollsY = SCROLLS.test(style.overflowY) && node.scrollHeight > node.clientHeight;
    const scrollsX = SCROLLS.test(style.overflowX) && node.scrollWidth > node.clientWidth;
    if (!scrollsY && !scrollsX) continue;

    const box = node.getBoundingClientRect();
    const wantTop = scrollsY
      ? targetOffset(node.scrollTop, block, top, rect.height, box.top + node.clientTop, node.clientHeight)
      : node.scrollTop;
    const wantLeft = scrollsX
      ? targetOffset(node.scrollLeft, inline, left, rect.width, box.left + node.clientLeft, node.clientWidth)
      : node.scrollLeft;
    const nextTop = Math.min(Math.max(wantTop, 0), node.scrollHeight - node.clientHeight);
    const nextLeft = Math.min(Math.max(wantLeft, 0), node.scrollWidth - node.clientWidth);
    if (nextTop === node.scrollTop && nextLeft === node.scrollLeft) continue;

    top -= nextTop - node.scrollTop;
    left -= nextLeft - node.scrollLeft;
    node.scrollTo({ top: nextTop, left: nextLeft, behavior });
    moved = true;
  }
  return moved;
}

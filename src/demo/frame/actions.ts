import type { DemoTiming } from '../protocol';
import { beginGesture, endGesture } from '@/store/history';
import type { DemoClock } from './clock';
import { cursorKindFor, travelDuration, type CursorController } from './cursor';
import type { Point } from './cursors';

/**
 * What the demo driver does with the real app: find a control, move the cursor
 * to it, click, type, glide a slider, pick from a menu, drag. Each primitive
 * dispatches the events a real mouse or keyboard would (untrusted, which is
 * what lets them past the input blocker) and waits on the run's clock.
 *
 * A control that cannot be found is warned about and skipped (the primitive
 * returns false): the step's store write still happens, so a run never gets
 * stuck on a missing button.
 */

export interface DemoContext {
  clock: DemoClock;
  cursor: CursorController;
  timing: DemoTiming;
}

/** How a control is found. Every field given must match. */
export interface Locator {
  /** ARIA role, explicit or implied by the tag (button, textbox, link). */
  role?: string;
  /** Accessible name: aria-label, aria-labelledby, label, placeholder, title or text. */
  name?: string | RegExp;
  /** `data-walkthrough` value. */
  walkthrough?: string;
  /** Other attributes, e.g. `{ 'data-section': 'boundary-timing' }`. */
  attrs?: Record<string, string>;
  /** Text content of the element itself. */
  text?: string | RegExp;
  /** A CSS selector the element matches. */
  selector?: string;
  /**
   * A row's label text: the control is the first element matching `selector`
   * (or `role`) in the nearest container of a label with this text.
   */
  label?: string | RegExp;
  /** Look only inside this element, or inside the first match of this locator. */
  within?: Locator | Element;
  /** Says what the control is in warnings. */
  description?: string;
}

export type Target = Element | Locator;

const DEFAULT_FIND_TIMEOUT = 4000;
const POLL_MS = 50;
/** Real time a smooth scroll takes to settle. */
const SCROLL_SETTLE_MS = 380;
/** How long a click holds the button down. */
const PRESS_MS = 90;

// --- finding -----------------------------------------------------------------

const IS_JSDOM = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);

function implicitRole(el: Element): string | null {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit;
  const tag = el.tagName;
  if (tag === 'BUTTON') return 'button';
  if (tag === 'A' && el.hasAttribute('href')) return 'link';
  if (tag === 'TEXTAREA') return 'textbox';
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    if (type === 'button' || type === 'submit') return 'button';
    if (type === 'checkbox') return 'checkbox';
    if (TEXT_INPUT_TYPES.has(type)) return 'textbox';
  }
  return null;
}

const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

function accessibleName(el: Element): string {
  const label = el.getAttribute('aria-label');
  if (label) return squash(label);
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy.split(/\s+/).map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '').join(' ');
    if (squash(text)) return squash(text);
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const forLabel = el.labels?.[0]?.textContent;
    if (squash(forLabel)) return squash(forLabel);
    if (el.placeholder) return squash(el.placeholder);
  }
  const title = el.getAttribute('title');
  const text = squash(el.textContent);
  return text || squash(title);
}

const matches = (value: string, pattern: string | RegExp) =>
  typeof pattern === 'string' ? value === squash(pattern) : pattern.test(value);

/** Text of the element without its descendants' controls (a label's own words). */
const ownText = (el: Element) => squash(el.textContent);

export function isVisible(el: Element): boolean {
  if (!el.isConnected) return false;
  if (el.closest('[hidden], [inert]')) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  if (IS_JSDOM) return true;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

function matchesLocator(el: Element, locator: Locator): boolean {
  if (locator.selector && !el.matches(locator.selector)) return false;
  if (locator.role && implicitRole(el) !== locator.role) return false;
  if (locator.walkthrough && el.getAttribute('data-walkthrough') !== locator.walkthrough) return false;
  if (locator.attrs) {
    for (const [key, value] of Object.entries(locator.attrs)) if (el.getAttribute(key) !== value) return false;
  }
  if (locator.text !== undefined && !matches(ownText(el), locator.text)) return false;
  if (locator.name !== undefined && !matches(accessibleName(el), locator.name)) return false;
  return true;
}

function candidatesSelector(locator: Locator): string {
  if (locator.selector) return locator.selector;
  if (locator.walkthrough) return `[data-walkthrough="${CSS.escape(locator.walkthrough)}"]`;
  if (locator.role === 'button') return 'button, [role="button"], input[type="button"], input[type="submit"]';
  if (locator.role === 'textbox') return 'input, textarea, [role="textbox"]';
  if (locator.role === 'link') return 'a[href], [role="link"]';
  if (locator.role) return `[role="${CSS.escape(locator.role)}"]`;
  return '*';
}

function scopeOf(locator: Locator, root: ParentNode): ParentNode | null {
  if (!locator.within) return root;
  if (locator.within instanceof Element) return locator.within;
  return query(locator.within, root);
}

/** The control in the row a label names: climb from the label until a container holds one. */
function queryByLabel(locator: Locator, scope: ParentNode): Element | null {
  const control = { ...locator, label: undefined, within: undefined };
  const selector = candidatesSelector(control);
  const labels = Array.from(scope.querySelectorAll('label, span, div, p, h3, legend'))
    .filter((el) => isVisible(el) && matches(ownText(el), locator.label!) && el.children.length <= 2);
  for (const label of labels) {
    for (let node = label.parentElement; node && node !== scope; node = node.parentElement) {
      const found = Array.from(node.querySelectorAll(selector)).find((el) => isVisible(el) && matchesLocator(el, control));
      if (found) return found;
    }
  }
  return null;
}

/** The first visible element the locator matches, now. */
export function query(locator: Locator, root: ParentNode = document): Element | null {
  const scope = scopeOf(locator, root);
  if (!scope) return null;
  if (locator.label !== undefined) return queryByLabel(locator, scope);
  return Array.from(scope.querySelectorAll(candidatesSelector(locator)))
    .find((el) => isVisible(el) && matchesLocator(el, locator)) ?? null;
}

const describe = (locator: Locator) =>
  locator.description ??
  JSON.stringify({ ...locator, within: locator.within ? '…' : undefined }, (_, v) => (v instanceof RegExp ? String(v) : v));

export function warn(message: string): void {
  console.warn(`[demo] ${message}`);
}

/**
 * Waits for the element to appear (cursor travel and React renders take time),
 * up to `timeout` real ms. Null, with a warning, when it never does.
 */
export async function find(
  ctx: DemoContext,
  target: Target,
  { timeout = DEFAULT_FIND_TIMEOUT, quiet = false }: { timeout?: number; quiet?: boolean } = {},
): Promise<Element | null> {
  if (target instanceof Element) return target.isConnected ? target : null;
  for (let waited = 0; ; waited += POLL_MS) {
    const el = query(target);
    if (el) return el;
    if (waited >= timeout) break;
    await ctx.clock.realDelay(POLL_MS);
  }
  if (!quiet) warn(`could not find ${describe(target)}`);
  return null;
}

// --- events --------------------------------------------------------------------

function centerOf(el: Element): Point {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function mouseInit(at: Point, extra: MouseEventInit = {}): MouseEventInit {
  return { bubbles: true, cancelable: true, composed: true, clientX: at.x, clientY: at.y, screenX: at.x, screenY: at.y, ...extra };
}

/** A mouse pointer event: the primary mouse, button 0. */
function pointer(type: string, el: Element, at: Point, extra: MouseEventInit = {}): boolean {
  const init = { ...mouseInit(at, extra), pointerId: 1, pointerType: 'mouse', isPrimary: true, width: 1, height: 1 };
  const event = new PointerEvent(type, init);
  // jsdom's PointerEvent has no pointerType; Radix reads it.
  if (event.pointerType !== 'mouse') Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  return el.dispatchEvent(event);
}

const mouse = (type: string, el: Element, at: Point, extra: MouseEventInit = {}) =>
  el.dispatchEvent(new MouseEvent(type, mouseInit(at, extra)));

/** Hover: what a real pointer arriving over the element sends. */
function hover(el: Element, at: Point): void {
  pointer('pointerover', el, at);
  pointer('pointerenter', el, at, { bubbles: false });
  mouse('mouseover', el, at);
  pointer('pointermove', el, at);
  mouse('mousemove', el, at);
}

const FOCUSABLE = 'input, textarea, select, button, a[href], [tabindex], [contenteditable="true"]';

/** Focus as a real mouse press gives it: the control pressed, or nothing (blur) on plain page. */
function focusFromPress(el: Element): void {
  const focusable = el.closest(FOCUSABLE) as HTMLElement | null;
  if (focusable && !(focusable as HTMLButtonElement).disabled) {
    if (el.ownerDocument.activeElement !== focusable) focusable.focus({ preventScroll: true });
    return;
  }
  const active = el.ownerDocument.activeElement as HTMLElement | null;
  if (active && active !== el.ownerDocument.body) active.blur();
}

export function key(el: Element, keyName: string, extra: KeyboardEventInit = {}): boolean {
  const init = { key: keyName, code: keyName.length === 1 ? `Key${keyName.toUpperCase()}` : keyName, bubbles: true, cancelable: true, composed: true, ...extra };
  const allowed = el.dispatchEvent(new KeyboardEvent('keydown', init));
  el.dispatchEvent(new KeyboardEvent('keyup', init));
  return allowed;
}

/** Lets React render what the last event changed: it flushes discrete updates in a microtask. */
export const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Sets a React-controlled field's value the way typing does: the native setter, then `input`. */
export function setFieldValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Radix sliders and timeline drags capture the pointer. Chrome refuses to
 * capture a pointer that is not really pressed, and a synthetic press is not,
 * so in the frame a capture the browser refuses is remembered instead and
 * `hasPointerCapture` reports it. Returns the restore function.
 */
export function installPointerCapturePatch(): () => void {
  const proto = Element.prototype;
  const original = {
    set: proto.setPointerCapture,
    has: proto.hasPointerCapture,
    release: proto.releasePointerCapture,
  };
  const captured = new WeakSet<Element>();
  proto.setPointerCapture = function setPointerCapture(this: Element, id: number) {
    try {
      original.set.call(this, id);
    } catch {
      captured.add(this);
    }
  };
  proto.hasPointerCapture = function hasPointerCapture(this: Element, id: number) {
    return captured.has(this) || original.has.call(this, id);
  };
  proto.releasePointerCapture = function releasePointerCapture(this: Element, id: number) {
    captured.delete(this);
    try {
      original.release.call(this, id);
    } catch {
      // Not captured by the browser.
    }
  };
  return () => {
    proto.setPointerCapture = original.set;
    proto.hasPointerCapture = original.has;
    proto.releasePointerCapture = original.release;
  };
}

// --- primitives ----------------------------------------------------------------

/** Holds still for `ms` of clock time. */
export const pause = (ctx: DemoContext, ms: number) => ctx.clock.wait(ms);

/** Scrolls the element into view when it is outside its scroll box or the window. */
async function reveal(ctx: DemoContext, el: Element): Promise<void> {
  if (IS_JSDOM || typeof el.scrollIntoView !== 'function') return;
  const rect = el.getBoundingClientRect();
  let outside = rect.top < 0 || rect.bottom > window.innerHeight || rect.left < 0 || rect.right > window.innerWidth;
  for (let node = el.parentElement; node && !outside; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (!/(auto|scroll)/.test(style.overflowY + style.overflowX)) continue;
    const box = node.getBoundingClientRect();
    outside = rect.top < box.top || rect.bottom > box.bottom;
  }
  if (!outside) return;
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  await ctx.clock.realDelay(SCROLL_SETTLE_MS);
}

/** Moves the cursor onto the element (or a point in it) and hovers it. */
export async function moveTo(
  ctx: DemoContext,
  target: Target,
  { at, timeout }: { at?: (el: Element) => Point; timeout?: number } = {},
): Promise<Element | null> {
  const el = await find(ctx, target, { timeout });
  if (!el) return null;
  await reveal(ctx, el);
  const point = () => (at ? at(el) : centerOf(el));
  let to = point();
  await ctx.cursor.travel(to, travelDuration(ctx.cursor.position, to, ctx.timing.move), ctx.clock, cursorKindFor(el));
  // A layout shift on the way (a panel opening) moved the target: hop the rest.
  const now = point();
  if (Math.hypot(now.x - to.x, now.y - to.y) > 2) {
    to = now;
    await ctx.cursor.travel(to, ctx.timing.move * 0.3, ctx.clock, cursorKindFor(el));
  }
  hover(el, to);
  return el;
}

/**
 * Presses the element and lets go: pointerdown, mousedown, focus, pointerup,
 * mouseup, click. A handled pointerdown (Radix menus open on it) suppresses the
 * mouse events and the focus, as in a browser.
 */
export function pressAndRelease(el: Element, at: Point): void {
  const proceed = pointer('pointerdown', el, at, { button: 0, buttons: 1 });
  if (proceed && mouse('mousedown', el, at, { button: 0, buttons: 1, detail: 1 })) focusFromPress(el);
  pointer('pointerup', el, at, { button: 0, buttons: 0 });
  if (proceed) mouse('mouseup', el, at, { button: 0, buttons: 0, detail: 1 });
  mouse('click', el, at, { button: 0, buttons: 0, detail: 1 });
}

/** Moves to the element and clicks it. False when it could not be found. */
export async function click(
  ctx: DemoContext,
  target: Target,
  { hold = true, timeout }: { hold?: boolean; timeout?: number } = {},
): Promise<boolean> {
  const el = await moveTo(ctx, target, { timeout });
  if (!el) return false;
  const at = ctx.cursor.position;
  ctx.cursor.setPressed(true);
  await ctx.clock.wait(PRESS_MS);
  ctx.clock.check();
  pressAndRelease(el, at);
  ctx.cursor.setPressed(false);
  if (hold) await ctx.clock.wait(ctx.timing.afterClick);
  return true;
}

/** Presses one key on the element (keydown, keyup). */
export async function press(ctx: DemoContext, target: Target, keyName: string): Promise<boolean> {
  const el = await find(ctx, target);
  if (!el) return false;
  key(el, keyName);
  await ctx.clock.wait(ctx.timing.typeChar);
  return true;
}

/** A typing rhythm: steady, with the small unevenness of real keystrokes. */
const keystrokeGap = (base: number, i: number) => base * (0.75 + 0.5 * ((Math.sin(i * 12.9898) + 1) / 2));

/**
 * Clicks into a text field and types `text` one character at a time (the
 * field's existing text is replaced unless `append`). Each character is a
 * native value change plus an `input` event, which React-controlled fields
 * read like typing.
 */
export async function type(
  ctx: DemoContext,
  target: Target,
  text: string,
  { append = false, enter = false }: { append?: boolean; enter?: boolean } = {},
): Promise<boolean> {
  const el = await find(ctx, target);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    if (el) warn('type: the target is not a text field');
    return false;
  }
  if (el.ownerDocument.activeElement !== el && !(await click(ctx, el, { hold: false }))) return false;
  ctx.cursor.setKind('ibeam');
  let value = append ? el.value : '';
  if (!append && el.value) {
    // Select all, then the first keystroke types over it.
    el.select();
    await ctx.clock.wait(ctx.timing.typeChar * 2);
  }
  for (let i = 0; i < text.length; i++) {
    ctx.clock.check();
    value += text[i];
    setFieldValue(el, value);
    await ctx.clock.wait(keystrokeGap(ctx.timing.typeChar, i));
  }
  if (!append && !text && el.value) setFieldValue(el, '');
  if (enter) key(el, 'Enter');
  return true;
}

interface SliderOptions {
  /** The value in the slider's own units (a log slider runs over ln(value)). */
  toSlider?: (value: number) => number;
}

const numberAttr = (el: Element, name: string) => Number(el.getAttribute(name));

/** Where on the track the thumb sits at slider value `v`. */
function trackPoint(root: Element, min: number, max: number, v: number): Point {
  const rect = root.getBoundingClientRect();
  const f = max > min ? (v - min) / (max - min) : 0;
  return { x: rect.left + rect.width * Math.min(1, Math.max(0, f)), y: rect.top + rect.height / 2 };
}

/**
 * Grabs a Radix slider's thumb and glides it to `value`: the cursor travels
 * along the track while arrow keys step the value with it, so the number and
 * the thumb follow the hand. The glide is one gesture, so it is one undo step.
 * The value lands within one step of the target (the step's store write puts
 * the exact value).
 */
export async function setSlider(ctx: DemoContext, target: Target, value: number, { toSlider = (v) => v }: SliderOptions = {}): Promise<boolean> {
  const found = await find(ctx, target);
  if (!found) return false;
  const thumb = found.getAttribute('role') === 'slider' ? found : found.querySelector('[role="slider"]');
  const root = thumb?.closest('[data-slot="slider"]') ?? thumb?.parentElement?.parentElement ?? null;
  if (!(thumb instanceof HTMLElement) || !root) {
    warn('setSlider: no slider thumb in the target');
    return false;
  }
  const min = numberAttr(thumb, 'aria-valuemin');
  const max = numberAttr(thumb, 'aria-valuemax');
  const goal = Math.min(max, Math.max(min, toSlider(value)));
  const now = () => numberAttr(thumb, 'aria-valuenow');
  const start = now();
  if (!(await moveTo(ctx, thumb))) return false;
  ctx.cursor.setPressed(true);
  await ctx.clock.wait(PRESS_MS);
  thumb.focus({ preventScroll: true });
  const direction = goal >= start ? 1 : -1;
  const stepKey = direction > 0 ? 'ArrowRight' : 'ArrowLeft';
  const startPoint = trackPoint(root, min, max, start);
  const endPoint = trackPoint(root, min, max, goal);
  const ms = Math.max(ctx.timing.inspectorEdit * 0.6, travelDuration(startPoint, endPoint, ctx.timing.inspectorEdit));
  let presses = 0;
  let stuck = 0;
  /** One arrow key, then the slider's re-render (React flushes it after the event). */
  const step = async (keyName: string) => {
    key(thumb, keyName);
    presses++;
    await settle();
  };
  /** Steps the value towards `v` (never past the goal); false once the slider stops moving. */
  const stepTo = async (v: number) => {
    while (presses < 2000 && (now() - v) * direction < 0 && (now() - goal) * direction < 0) {
      const before = now();
      await step(stepKey);
      if (now() === before) {
        if (++stuck > 3) return false;
      } else {
        stuck = 0;
      }
      // One step past the goal is further from it than stopping short.
      if ((now() - goal) * direction > 0) {
        if (Math.abs(before - goal) < Math.abs(now() - goal)) await step(direction > 0 ? 'ArrowLeft' : 'ArrowRight');
        return false;
      }
    }
    return true;
  };
  beginGesture();
  try {
    let moving = true;
    const t0 = ctx.clock.now();
    for (let t = 0; t < 1; ) {
      t = ms > 0 ? Math.min(1, (ctx.clock.now() - t0) / ms) : 1;
      ctx.cursor.jumpTo({ x: startPoint.x + (endPoint.x - startPoint.x) * t, y: startPoint.y });
      if (moving) moving = await stepTo(start + (goal - start) * t);
      if (t < 1) await ctx.clock.realDelay(16);
    }
    if (moving) await stepTo(goal);
  } finally {
    endGesture();
    ctx.cursor.setPressed(false);
  }
  await ctx.clock.wait(ctx.timing.afterClick * 0.5);
  return true;
}

/**
 * Picks an option of a Radix Select (or any listbox): clicks the trigger, then
 * the option with this text in the list that opens.
 */
export async function selectOption(ctx: DemoContext, trigger: Target, option: string | RegExp): Promise<boolean> {
  const el = await find(ctx, trigger);
  if (!el) return false;
  if (el.getAttribute('aria-expanded') !== 'true' && !(await click(ctx, el))) return false;
  const item = await find(ctx, { role: 'option', name: option, description: `option ${String(option)}` });
  if (!item) {
    // Close the list again so the next step starts from a calm screen.
    key(el.ownerDocument.activeElement ?? el, 'Escape');
    return false;
  }
  return click(ctx, item);
}

/**
 * Drags from one element (or point) to another: press, travel with pointer
 * moves on the way, release. A drag is one gesture, as with a real mouse.
 */
export async function drag(ctx: DemoContext, from: Target, to: Target | Point): Promise<boolean> {
  const source = await moveTo(ctx, from);
  if (!source) return false;
  let end: Point;
  if (to instanceof Element || !('x' in to)) {
    const dest = await find(ctx, to as Target);
    if (!dest) return false;
    end = centerOf(dest);
  } else {
    end = to;
  }
  const start = ctx.cursor.position;
  ctx.cursor.setPressed(true);
  pointer('pointerdown', source, start, { button: 0, buttons: 1 });
  mouse('mousedown', source, start, { button: 0, buttons: 1 });
  await ctx.clock.wait(PRESS_MS);
  try {
    let frame = 0;
    await ctx.clock.animate(travelDuration(start, end, ctx.timing.move), (t) => {
      const at = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
      ctx.cursor.jumpTo(at);
      if (++frame % 2 === 0 || t >= 1) {
        pointer('pointermove', source, at, { buttons: 1 });
        mouse('mousemove', source, at, { buttons: 1 });
      }
    });
  } finally {
    pointer('pointerup', source, end, { button: 0, buttons: 0 });
    mouse('mouseup', source, end, { button: 0, buttons: 0 });
    ctx.cursor.setPressed(false);
  }
  await ctx.clock.wait(ctx.timing.afterClick);
  return true;
}

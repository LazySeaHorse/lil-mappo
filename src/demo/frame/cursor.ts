import type { DemoClock } from './clock';
import { cubicBezier, type CursorKind, type Point } from './cursors';

/**
 * The demo cursor's position and look. The driver moves it; `DemoCursor`
 * draws it. Moves write the element's transform straight away (no React
 * render per frame).
 */

/** A hand's natural move: quick to leave, a long soft landing. */
const TRAVEL_EASE = cubicBezier(0.5, 0, 0.12, 1);

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', '']);
const CLICKABLE_ROLES = new Set([
  'button', 'link', 'switch', 'radio', 'checkbox', 'option', 'menuitem', 'menuitemradio',
  'menuitemcheckbox', 'tab', 'combobox', 'slider',
]);

function isTextField(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement) return !el.disabled;
  if (el instanceof HTMLInputElement) return !el.disabled && TEXT_INPUT_TYPES.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

function isClickable(el: Element): boolean {
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return false;
  const tag = el.tagName;
  if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'SUMMARY' || tag === 'LABEL') return true;
  if (tag === 'A' && el.hasAttribute('href')) return true;
  if (tag === 'INPUT') return true;
  const role = el.getAttribute('role');
  return !!role && CLICKABLE_ROLES.has(role);
}

/** The cursor macOS would show over `el`: the I-beam over text fields, the hand over controls, else the arrow. */
export function cursorKindFor(el: Element | null): CursorKind {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    if (isTextField(node)) return 'ibeam';
    if (isClickable(node)) return 'hand';
  }
  return 'pointer';
}

/**
 * Points along the move from `from` to `to`: a gentle arc (a hand pivots at the
 * wrist, it does not slide along a ruler), bowed more on longer moves.
 */
export function travelPoint(from: Point, to: Point, t: number, bend = 1): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  // Bow to the right of the direction of travel, as a right hand arcs.
  const bow = Math.min(90, distance * 0.14) * bend;
  const cx = (from.x + to.x) / 2 + (distance ? (-dy / distance) * bow : 0);
  const cy = (from.y + to.y) / 2 + (distance ? (dx / distance) * bow : 0);
  const e = TRAVEL_EASE(t);
  const u = 1 - e;
  return {
    x: u * u * from.x + 2 * u * e * cx + e * e * to.x,
    y: u * u * from.y + 2 * u * e * cy + e * e * to.y,
  };
}

/** How long a move takes: `base` for an ordinary trip, less for a short hop, more across the screen. */
export function travelDuration(from: Point, to: Point, base: number): number {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (distance < 1) return 0;
  return base * Math.min(1.4, Math.max(0.45, 0.4 + distance / 900));
}

export class CursorController {
  position: Point;
  kind: CursorKind = 'pointer';
  pressed = false;
  hidden = false;
  private el: HTMLElement | null = null;

  constructor(start: Point = { x: 0, y: 0 }) {
    this.position = start;
  }

  /** The element `DemoCursor` draws; null when it unmounts. */
  attach(el: HTMLElement | null): void {
    this.el = el;
    this.paint();
  }

  setKind(kind: CursorKind): void {
    if (this.kind === kind) return;
    this.kind = kind;
    this.paint();
  }

  setPressed(pressed: boolean): void {
    this.pressed = pressed;
    this.paint();
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.paint();
  }

  jumpTo(point: Point): void {
    this.position = point;
    this.paint();
  }

  /**
   * Travels to `to` over `ms` of clock time along an arc. The look follows what
   * is under the cursor on the way (when the page can say), and ends as `arrive`.
   */
  async travel(to: Point, ms: number, clock: DemoClock, arrive?: CursorKind): Promise<void> {
    const from = this.position;
    let frame = 0;
    await clock.animate(ms, (t) => {
      this.position = t >= 1 ? to : travelPoint(from, to, t);
      if (t < 1 && ++frame % 3 === 0) this.kind = this.kindUnderneath() ?? this.kind;
      this.paint();
    });
    if (arrive) this.setKind(arrive);
  }

  private kindUnderneath(): CursorKind | null {
    if (typeof document.elementFromPoint !== 'function') return null;
    return cursorKindFor(document.elementFromPoint(this.position.x, this.position.y));
  }

  private paint(): void {
    const el = this.el;
    if (!el) return;
    el.style.transform = `translate3d(${this.position.x}px, ${this.position.y}px, 0)`;
    el.dataset.kind = this.kind;
    el.dataset.pressed = String(this.pressed);
    el.dataset.hidden = String(this.hidden);
  }
}

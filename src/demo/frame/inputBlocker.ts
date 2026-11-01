import { postDemoMessage } from '../protocol';

/**
 * Real input the frame swallows, so the app can't be operated by hand while the
 * driver's synthetic (untrusted) events still reach it. Focus events are left
 * alone on purpose: the driver's `focus()` / `blur()` calls fire trusted ones
 * (inspector fields flush on blur), and the trusted input that moves focus
 * (clicks, Tab) is already blocked here.
 */
export const BLOCKED_EVENTS = [
  'pointerdown', 'pointerup', 'pointermove', 'pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'pointercancel',
  'mousedown', 'mouseup', 'mousemove', 'mouseover', 'mouseout', 'mouseenter', 'mouseleave',
  'click', 'dblclick', 'auxclick', 'contextmenu', 'wheel',
  'touchstart', 'touchmove', 'touchend', 'touchcancel',
  'keydown', 'keyup', 'keypress',
  'dragstart', 'drag', 'dragend', 'dragenter', 'dragover', 'dragleave', 'drop',
] as const;

type BlockableEvent = Pick<Event, 'type' | 'isTrusted' | 'preventDefault' | 'stopImmediatePropagation'> &
  Partial<Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey'>>;

/** Only real input is blocked; everything the driver dispatches is untrusted. */
export function shouldBlock(event: Pick<Event, 'isTrusted'>): boolean {
  return event.isTrusted;
}

/** Cmd/Ctrl+Period: show or hide the widget (handled by the shell). */
export function isWidgetShortcut(event: BlockableEvent): boolean {
  return event.type === 'keydown' && !!(event.metaKey || event.ctrlKey) && (event.key === '.' || event.code === 'Period');
}

/** Swallows a trusted event; the widget shortcut is forwarded through `onToggleWidget` first. Returns whether it was blocked. */
export function blockEvent(event: BlockableEvent, onToggleWidget: () => void): boolean {
  if (!shouldBlock(event)) return false;
  if (isWidgetShortcut(event)) onToggleWidget();
  event.stopImmediatePropagation();
  event.preventDefault();
  return true;
}

/**
 * Capture-phase listeners on `window` run before any listener in the page
 * (Mapbox's canvas handlers included), so stopping there means nothing else
 * sees the event. Install before the app renders. Returns the uninstall.
 */
export function installInputBlocker(): () => void {
  const toggleWidget = () => {
    if (window.parent !== window) postDemoMessage(window.parent, { type: 'toggle-widget' });
  };
  const listener = (event: Event) => {
    blockEvent(event as BlockableEvent, toggleWidget);
  };
  // Not passive, so touch and wheel defaults (scroll, zoom) can be prevented.
  const options: AddEventListenerOptions = { capture: true, passive: false };
  BLOCKED_EVENTS.forEach((type) => window.addEventListener(type, listener, options));

  // The driver draws its own cursor.
  const style = document.createElement('style');
  style.textContent = '* { cursor: none !important; }';
  document.head.appendChild(style);

  return () => {
    BLOCKED_EVENTS.forEach((type) => window.removeEventListener(type, listener, options));
    style.remove();
  };
}

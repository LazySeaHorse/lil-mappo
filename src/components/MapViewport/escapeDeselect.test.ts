import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleEscapeKey, isEscapeHandledElsewhere } from './escapeDeselect';
import { useProjectStore } from '@/store/useProjectStore';
import type { RouteItem } from '@/store/types';

const initialStore = useProjectStore.getState();
const route = { kind: 'route', id: 'r', name: 'Road', startTime: 1, endTime: 3 } as RouteItem;

function press(target: Element | Window = window, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  useProjectStore.setState(initialStore, true);
  useProjectStore.setState({ items: { r: route }, itemOrder: ['r'], duration: 10 });
  window.addEventListener('keydown', handleEscapeKey);
});

afterEach(() => {
  window.removeEventListener('keydown', handleEscapeKey);
  document.body.innerHTML = '';
});

describe('Escape deselect', () => {
  it('clears the selection', () => {
    useProjectStore.getState().selectItem('r');
    press();
    expect(useProjectStore.getState().selectedItemId).toBeNull();
  });

  it('ignores other keys', () => {
    useProjectStore.getState().selectItem('r');
    press(window, { key: 'a' });
    expect(useProjectStore.getState().selectedItemId).toBe('r');
  });

  it('stops an active picker first and keeps the selection', () => {
    useProjectStore.getState().selectItem('r');
    const stopPicking = vi.fn();
    useProjectStore.setState({ activePicker: { id: 'p', prompt: 'Point', onPick: vi.fn() }, stopPicking });
    press();
    expect(stopPicking).toHaveBeenCalledTimes(1);
    expect(useProjectStore.getState().selectedItemId).toBe('r');
  });

  it('skips events another handler already consumed', () => {
    useProjectStore.getState().selectItem('r');
    const consume = (e: Event) => e.preventDefault();
    document.addEventListener('keydown', consume, { capture: true });
    press(document.body);
    document.removeEventListener('keydown', consume, { capture: true });
    expect(useProjectStore.getState().selectedItemId).toBe('r');
  });

  it.each(['input', 'textarea', 'select'])('skips Escape typed in a %s', (tag) => {
    useProjectStore.getState().selectItem('r');
    const el = document.body.appendChild(document.createElement(tag));
    press(el);
    expect(useProjectStore.getState().selectedItemId).toBe('r');
  });

  it('skips Escape inside a contenteditable, dialog or menu', () => {
    useProjectStore.getState().selectItem('r');
    const editable = document.body.appendChild(document.createElement('div'));
    editable.setAttribute('contenteditable', 'true');
    const dialog = document.body.appendChild(document.createElement('div'));
    dialog.setAttribute('role', 'dialog');
    const item = dialog.appendChild(document.createElement('button'));
    const menu = document.body.appendChild(document.createElement('div'));
    menu.setAttribute('role', 'menu');
    for (const el of [editable, item, menu]) press(el);
    expect(useProjectStore.getState().selectedItemId).toBe('r');
  });

  it('leaves a closed inspector closed and an open one open', () => {
    useProjectStore.getState().selectItem('r');
    useProjectStore.setState({ isInspectorOpen: false });
    press();
    expect(useProjectStore.getState().isInspectorOpen).toBe(false);

    useProjectStore.getState().selectItem('r');
    press();
    expect(useProjectStore.getState().isInspectorOpen).toBe(true);
  });

  it('does nothing without a selection', () => {
    const selectItem = vi.fn();
    useProjectStore.setState({ selectItem });
    press();
    expect(selectItem).not.toHaveBeenCalled();
  });
});

describe('isEscapeHandledElsewhere', () => {
  it('lets a bare window event through', () => {
    expect(isEscapeHandledElsewhere({ defaultPrevented: false, target: window })).toBe(false);
  });
});

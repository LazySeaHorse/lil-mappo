import { blockEvent, installInputBlocker, isWidgetShortcut, shouldBlock } from './inputBlocker';

/** jsdom events are always untrusted, so trusted ones are plain stand-ins. */
function fakeEvent(type: string, init: { isTrusted: boolean; key?: string; code?: string; metaKey?: boolean; ctrlKey?: boolean }) {
  return { type, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), ...init };
}

describe('input blocker', () => {
  it('blocks trusted events only', () => {
    expect(shouldBlock({ isTrusted: true })).toBe(true);
    expect(shouldBlock({ isTrusted: false })).toBe(false);
  });

  it('swallows a trusted event and leaves an untrusted one alone', () => {
    const toggle = vi.fn();
    const real = fakeEvent('pointerdown', { isTrusted: true });
    expect(blockEvent(real, toggle)).toBe(true);
    expect(real.stopImmediatePropagation).toHaveBeenCalled();
    expect(real.preventDefault).toHaveBeenCalled();

    const synthetic = fakeEvent('pointerdown', { isTrusted: false });
    expect(blockEvent(synthetic, toggle)).toBe(false);
    expect(synthetic.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(toggle).not.toHaveBeenCalled();
  });

  it('forwards a real Cmd/Ctrl+Period to the shell and still swallows it', () => {
    const toggle = vi.fn();
    const cmd = fakeEvent('keydown', { isTrusted: true, key: '.', code: 'Period', metaKey: true });
    expect(blockEvent(cmd, toggle)).toBe(true);
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(cmd.stopImmediatePropagation).toHaveBeenCalled();

    blockEvent(fakeEvent('keydown', { isTrusted: true, key: '>', code: 'Period', ctrlKey: true }), toggle);
    expect(toggle).toHaveBeenCalledTimes(2);
  });

  it('recognises only the widget shortcut', () => {
    expect(isWidgetShortcut(fakeEvent('keydown', { isTrusted: true, key: '.' }))).toBe(false);
    expect(isWidgetShortcut(fakeEvent('keyup', { isTrusted: true, key: '.', metaKey: true }))).toBe(false);
    expect(isWidgetShortcut(fakeEvent('keydown', { isTrusted: true, key: ',', code: 'Comma', metaKey: true }))).toBe(false);
  });

  it('lets synthetic events through once installed, and hides the pointer until uninstalled', () => {
    const uninstall = installInputBlocker();
    const button = document.createElement('button');
    document.body.appendChild(button);
    const onClick = vi.fn();
    button.addEventListener('click', onClick);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(document.head.textContent).toContain('cursor: none');

    uninstall();
    expect(document.head.textContent).not.toContain('cursor: none');
    button.remove();
  });
});

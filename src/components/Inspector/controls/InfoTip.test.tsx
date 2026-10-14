import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfoTip } from './InfoTip';

const HINT = 'How lively the motion feels.';

const button = () => screen.getByRole('button', { name: 'More info' });

/** jsdom has no touch pointer events; build one with a pointer type. */
function pointer(target: Element, type: string, pointerType: 'mouse' | 'touch') {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  fireEvent(target, event);
}

/** A tap: pointer down, pointer up, click. */
function tap(target: Element) {
  pointer(target, 'pointerdown', 'touch');
  pointer(target, 'pointerup', 'touch');
  fireEvent.click(target);
}

describe('InfoTip', () => {
  it('is a button named "More info" and shows nothing until asked', () => {
    render(<InfoTip text={HINT} />);
    expect(button().tagName).toBe('BUTTON');
    expect(button()).toHaveAttribute('type', 'button');
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it('shows the hint on hover and hides it when the pointer leaves', async () => {
    render(<InfoTip text={HINT} />);
    pointer(button(), 'pointermove', 'mouse');
    expect(await screen.findByRole('tooltip')).toHaveTextContent(HINT);
    fireEvent.pointerLeave(button());
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('shows the hint on keyboard focus, describes the button with it, and closes on Escape', async () => {
    render(<InfoTip text={HINT} />);
    fireEvent.focus(button());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(HINT);
    expect(button()).toHaveAccessibleDescription(HINT);
    fireEvent.keyDown(button(), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('shows the hint when a touch user taps, and hides it on the next tap', async () => {
    render(<InfoTip text={HINT} />);
    tap(button());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(HINT);
    tap(button());
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('shows the hint on a plain click (keyboard Enter or Space)', async () => {
    render(<InfoTip text={HINT} />);
    fireEvent.click(button());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(HINT);
  });

  it('keeps the hint open after a mouse click that follows a hover', async () => {
    render(<InfoTip text={HINT} />);
    pointer(button(), 'pointermove', 'mouse');
    await screen.findByRole('tooltip');
    pointer(button(), 'pointerdown', 'mouse');
    fireEvent.click(button());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(HINT);
  });

  it('closes when the user taps somewhere else', async () => {
    render(<div><InfoTip text={HINT} /><p>Elsewhere</p></div>);
    tap(button());
    await screen.findByRole('tooltip');
    pointer(screen.getByText('Elsewhere'), 'pointerdown', 'touch');
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });
});

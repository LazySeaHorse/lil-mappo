import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MapPill } from './MapPill';

describe('MapPill', () => {
  it('shows the leading mark and label in one button that runs onClick', () => {
    const onClick = vi.fn();
    render(
      <MapPill testId="pill" leading={<span data-testid="mark" />} title="Do the thing" onClick={onClick}>
        Label text
      </MapPill>,
    );

    const button = screen.getByRole('button', { name: 'Label text' });
    expect(button).toHaveAttribute('title', 'Do the thing');
    expect(button).toContainElement(screen.getByTestId('mark'));
    expect(screen.getByTestId('pill')).toContainElement(button);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('has no close button unless asked for one', () => {
    render(<MapPill leading={null} onClick={() => {}}>Label</MapPill>);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('adds a close button that runs only its own handler', () => {
    const onClick = vi.fn();
    const onDismiss = vi.fn();
    render(
      <MapPill leading={null} onClick={onClick} dismiss={{ label: 'Clear selection', onClick: onDismiss }}>
        Label
      </MapPill>,
    );

    const close = screen.getByRole('button', { name: 'Clear selection' });
    expect(close).toHaveAttribute('title', 'Clear selection');
    fireEvent.click(close);
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
  });
});

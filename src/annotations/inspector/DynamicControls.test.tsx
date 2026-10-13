import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ACCENT_TERMS } from '@/lib/terms';
import type { ControlDefinition } from '../types';
import { DynamicControls } from './DynamicControls';

const controls: ControlDefinition[] = [
  { type: 'color', key: 'line', label: 'Line color', role: 'accent' },
  { type: 'color', key: 'dot', label: 'Dot color', role: 'accent' },
  { type: 'color', key: 'text', label: 'Text color' },
  { type: 'switch', key: 'pulse', label: 'Pulse' },
];
const settings = { line: '#22c55e', dot: '#ef4444', text: '#333333', pulse: false };

function setup(overrides: { controls?: ControlDefinition[]; settings?: Record<string, unknown> } = {}) {
  const onUpdate = vi.fn();
  render(<DynamicControls controls={overrides.controls ?? controls} settings={overrides.settings ?? settings} onUpdate={onUpdate} />);
  return onUpdate;
}

describe('DynamicControls accent colour', () => {
  it('shows one accent row in place of the accent controls, with the other colors folded away', () => {
    setup();
    expect(screen.getByText(ACCENT_TERMS.accent)).toBeInTheDocument();
    expect(screen.queryByText('Line color')).toBeNull();
    expect(screen.queryByText('Dot color')).toBeNull();
    expect(screen.queryByText('Text color')).toBeNull();
    expect(screen.getByRole('button', { name: ACCENT_TERMS.customize })).toHaveAttribute('aria-expanded', 'false');
    // Other kinds of control stay where they were.
    expect(screen.getByText('Pulse')).toBeInTheDocument();
  });

  it('shows the first accent value and sets every accent key in one update', () => {
    const onUpdate = setup();
    // The row shows the first accent value (green), not the second (red).
    expect(screen.getByLabelText('Select color #22c55e')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Select color #ef4444')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByLabelText('Select color #3b82f6'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ line: '#3b82f6', dot: '#3b82f6' });
  });

  it('shows the other colors only after the user opens Customize colors', () => {
    setup();
    expect(screen.queryByText('Text color')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: ACCENT_TERMS.customize }));
    expect(screen.getByText('Text color')).toBeInTheDocument();
    expect(screen.queryByText('Line color')).toBeNull();
  });

  it('changes one other color on its own', () => {
    const onUpdate = setup();
    fireEvent.click(screen.getByRole('button', { name: ACCENT_TERMS.customize }));
    const swatches = screen.getAllByLabelText('Select color #8b5cf6');
    fireEvent.click(swatches[swatches.length - 1]);
    expect(onUpdate).toHaveBeenLastCalledWith({ text: '#8b5cf6' });
  });

  it('lists every color plainly when the style has no accent control', () => {
    setup({ controls: controls.map((c) => ('role' in c ? { ...c, role: undefined } : c)) as ControlDefinition[] });
    expect(screen.getByText('Line color')).toBeInTheDocument();
    expect(screen.getByText('Text color')).toBeInTheDocument();
    expect(screen.queryByText(ACCENT_TERMS.accent)).toBeNull();
    expect(screen.queryByRole('button', { name: ACCENT_TERMS.customize })).toBeNull();
  });

  it('has no fold when every color is an accent color', () => {
    setup({ controls: controls.filter((c) => c.type !== 'color' || c.role === 'accent') });
    expect(screen.getByText(ACCENT_TERMS.accent)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ACCENT_TERMS.customize })).toBeNull();
  });
});

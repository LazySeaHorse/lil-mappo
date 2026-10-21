import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MODEL_TERMS } from './modelTerms';
import { ModelPickerDialog } from './ModelPickerDialog';

const setup = () => {
  const onFile = vi.fn();
  render(<ModelPickerDialog open onOpenChange={() => {}} onFile={onFile} />);
  return { popup: screen.getByRole('dialog'), onFile };
};

describe('ModelPickerDialog', () => {
  it('opens with Mappo holding a cube over a drawn model scene, not a map still', () => {
    const { popup } = setup();
    expect(popup.querySelector('[data-slot="pin-drop"]')?.getAttribute('data-scene')).toBe('model');
    expect(popup.querySelector('svg[data-mood="cube"]')).not.toBeNull();
    expect(popup.querySelector('img')).toBeNull();
  });

  it('explains the file rules: .glb only, size, stays in the browser, pick again after a reload', () => {
    const { popup } = setup();
    for (const line of MODEL_TERMS.popupFacts) expect(within(popup).getByText(line)).toBeInTheDocument();
    expect(MODEL_TERMS.popupFacts.join(' ')).toMatch(/\.glb/);
    expect(MODEL_TERMS.popupFacts.join(' ')).toMatch(/50 MB/);
    expect(MODEL_TERMS.popupFacts.join(' ')).toMatch(/never uploaded/);
    expect(MODEL_TERMS.popupFacts.join(' ')).toMatch(/after a reload/i);
  });

  it('still offers the file picker', () => {
    const { popup } = setup();
    expect(within(popup).getByRole('button', { name: MODEL_TERMS.upload })).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('model-file-input'), { target: { files: [new File(['x'], 'a.glb')] } });
  });
});

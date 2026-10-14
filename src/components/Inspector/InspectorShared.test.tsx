import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Field } from '@/components/ui/field';
import {
  EasingSelect,
  SliderRow,
  ColorRow,
  SwitchRow,
  SelectRow,
  NumberRow,
  CoordinatesRows,
  VisualCardSelect,
  EditableTitle,
} from './InspectorShared';
import {
  EASING_OPTIONS,
  formatDecimals,
  formatDegrees,
  formatMultiplier,
  formatPercent,
  normalizeEasing,
} from './inspectorValues';

describe('InspectorShared Utilities & Formatters', () => {
  it('normalizes legacy and alternative easing names to supported presets', () => {
    expect(normalizeEasing('easeInOutSine')).toBe('easeInOutSine');
    expect(normalizeEasing('easeInOutCubic')).toBe('easeInOutSine');
    expect(normalizeEasing('easeInOutQuad')).toBe('easeInOutSine');
    expect(normalizeEasing('easeInCubic')).toBe('easeInQuad');
    expect(normalizeEasing('easeOutCubic')).toBe('easeOutQuad');
    expect(normalizeEasing('bounce')).toBe('bounce');
    expect(normalizeEasing('linear')).toBe('linear');
    expect(normalizeEasing(undefined)).toBe('easeInOutSine');
  });

  it('formats numbers with helpers', () => {
    expect(formatPercent(0.75)).toBe('75 %');
    expect(formatPercent(0)).toBe('0 %');
    expect(formatPercent(1)).toBe('100 %');

    expect(formatDegrees(45.5)).toBe('45.5°');
    expect(formatDegrees(0)).toBe('0.0°');

    expect(formatMultiplier(1.5)).toBe('1.5x');
    expect(formatMultiplier(2)).toBe('2.0x');

    const fmt3 = formatDecimals(3);
    expect(fmt3(3.14159)).toBe('3.142');
  });

  it('contains valid EASING_OPTIONS', () => {
    expect(EASING_OPTIONS.length).toBeGreaterThanOrEqual(5);
    expect(EASING_OPTIONS.map((o) => o.value)).toContain('easeInOutSine');
    expect(EASING_OPTIONS.map((o) => o.value)).toContain('linear');
  });
});

describe('EditableTitle', () => {
  it('renders input with value and calls onChange on user input', () => {
    const onChange = vi.fn();
    render(<EditableTitle value="Original Name" onChange={onChange} placeholder="Enter name..." />);

    const input = screen.getByPlaceholderText('Enter name...');
    expect(input).toHaveValue('Original Name');

    fireEvent.change(input, { target: { value: 'New Name' } });
    expect(onChange).toHaveBeenCalledWith('New Name');
  });
});

describe('SliderRow', () => {
  it('renders label, unit, formatted display, and updates on change', () => {
    const onChange = vi.fn();
    render(
      <SliderRow
        label="Stroke width"
        value={5}
        onChange={onChange}
        min={1}
        max={15}
        step={1}
        unit="px"
      />
    );

    expect(screen.getByText('Stroke width')).toBeInTheDocument();
    expect(screen.getByText('5 px')).toBeInTheDocument();
  });

  it('uses custom formatValue if provided', () => {
    const onChange = vi.fn();
    render(
      <SliderRow
        label="Opacity"
        value={0.4}
        onChange={onChange}
        min={0}
        max={1}
        step={0.01}
        formatValue={formatPercent}
      />
    );

    expect(screen.getByText('Opacity')).toBeInTheDocument();
    expect(screen.getByText('40 %')).toBeInTheDocument();
  });
});

describe('SliderRow hint and end labels', () => {
  const base = { label: 'Energy', value: 0.5, onChange: () => {}, min: 0, max: 1, step: 0.1 };

  it('puts the hint in an (i) tip next to the label, not on a visible line', async () => {
    const { container } = render(<SliderRow {...base} hint="How lively the motion feels." />);
    expect(screen.getByText('Energy')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="slider-hint"]')).toBeNull();
    expect(screen.queryByText('How lively the motion feels.')).toBeNull();
    const tip = screen.getByRole('button', { name: 'More info' });
    expect(screen.getByText('Energy').compareDocumentPosition(tip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.focus(tip);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('How lively the motion feels.');
  });

  it('has no (i) tip without a hint', () => {
    render(<SliderRow {...base} />);
    expect(screen.queryByRole('button', { name: 'More info' })).toBeNull();
  });

  it('shows no hint or end labels unless asked', () => {
    const { container } = render(<SliderRow {...base} />);
    expect(container.querySelector('[data-slot="slider-hint"]')).toBeNull();
    expect(container.querySelector('[data-slot="slider-end-labels"]')).toBeNull();
  });

  it('shows words under the left and right ends of the slider', () => {
    render(<SliderRow {...base} endLabels={['Calm', 'Lively']} />);
    const [left, right] = [screen.getByText('Calm'), screen.getByText('Lively')];
    expect(left.parentElement).toBe(right.parentElement);
    expect(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the readout unless it is hidden', () => {
    const { rerender } = render(<SliderRow {...base} endLabels={['Calm', 'Lively']} unit="x" />);
    expect(screen.getByText('0.5 x')).toBeInTheDocument();
    rerender(<SliderRow {...base} endLabels={['Calm', 'Lively']} unit="x" showValue={false} />);
    expect(screen.queryByText('0.5 x')).not.toBeInTheDocument();
    expect(screen.getByText('Calm')).toBeInTheDocument();
  });

  it('still moves the slider with the keyboard when the readout is hidden', () => {
    const onChange = vi.fn();
    render(<SliderRow {...base} onChange={onChange} endLabels={['Calm', 'Lively']} showValue={false} />);
    const thumb = screen.getByRole('slider');
    thumb.focus();
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(0.6);
  });
});

describe('ColorRow', () => {
  it('renders label and color picker', () => {
    const onChange = vi.fn();
    render(<ColorRow label="Border color" value="#3b82f6" onChange={onChange} />);

    expect(screen.getByText('Border color')).toBeInTheDocument();
    expect(screen.getByLabelText('Select color #3b82f6')).toBeInTheDocument();
    expect(screen.getByLabelText('More colors')).toBeInTheDocument();
  });

  it('triggers onChange when clicking a preset swatch in ColorRow', () => {
    const onChange = vi.fn();
    render(<ColorRow label="Border color" value="#3b82f6" onChange={onChange} />);

    fireEvent.click(screen.getByLabelText('Select color #ef4444'));
    expect(onChange).toHaveBeenCalledWith('#ef4444');
  });

  it('puts the label above the swatches, not beside them', () => {
    const { container } = render(<ColorRow label="Border color" value="#3b82f6" onChange={() => {}} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('flex-col');
    const label = screen.getByText('Border color');
    const swatches = container.querySelector('[data-slot="color-picker"]') as HTMLElement;
    expect(label.compareDocumentPosition(swatches) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The label and the swatches are in different lines.
    expect(label.closest('[data-slot="color-row-label"]')?.contains(swatches)).toBe(false);
  });

  it('shows the hint as an (i) tip after the label', () => {
    render(<ColorRow label="Fog color" value="#3b82f6" onChange={() => {}} hint="Tints the horizon." />);
    const tip = screen.getByRole('button', { name: 'More info' });
    expect(screen.getByText('Fog color').compareDocumentPosition(tip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows an action next to the swatches', () => {
    const onReset = vi.fn();
    render(
      <ColorRow
        label="Fog color"
        value="#3b82f6"
        onChange={() => {}}
        action={<button type="button" onClick={onReset}>Reset</button>}
      />,
    );
    const swatches = document.querySelector('[data-slot="color-picker"]') as HTMLElement;
    const reset = screen.getByRole('button', { name: 'Reset' });
    expect(swatches.parentElement).toBe(reset.parentElement);
    fireEvent.click(reset);
    expect(onReset).toHaveBeenCalled();
  });
});

describe('SwitchRow', () => {
  it('renders label, sublabel, and triggers onChange when clicked', () => {
    const onChange = vi.fn();
    render(
      <SwitchRow
        label="Enable glow"
        sublabel="Adds soft glow effect"
        checked={false}
        onChange={onChange}
      />
    );

    expect(screen.getByText('Enable glow')).toBeInTheDocument();
    // The explanation is an (i) tip, not a visible line.
    expect(screen.queryByText('Adds soft glow effect')).toBeNull();
    expect(screen.getByRole('button', { name: 'More info' })).toBeInTheDocument();

    const switchBtn = screen.getByRole('switch');
    fireEvent.click(switchBtn);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('NumberRow', () => {
  it('renders label, value, unit, and triggers onChange', () => {
    const onChange = vi.fn();
    render(
      <NumberRow
        label="Time"
        value={3.5}
        onChange={onChange}
        min={0}
        step={0.1}
        unit="s"
      />
    );

    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByText('s')).toBeInTheDocument();
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveValue(3.5);

    fireEvent.change(input, { target: { value: '4.2' } });
    expect(onChange).toHaveBeenCalledWith(4.2);
  });
});

describe('SelectRow', () => {
  it('renders label and select trigger with active value', () => {
    const onChange = vi.fn();
    render(
      <SelectRow
        label="Font"
        value="Inter"
        onChange={onChange}
        options={[
          { value: 'Inter', label: 'Inter' },
          { value: 'Roboto', label: 'Roboto' },
        ]}
      />
    );

    expect(screen.getByText('Font')).toBeInTheDocument();
    expect(screen.getByText('Inter')).toBeInTheDocument();
  });
});

describe('CoordinatesRows', () => {
  it('renders longitude and latitude and handles updates', () => {
    const onChange = vi.fn();
    render(<CoordinatesRows lngLat={[-122.4194, 37.7749]} onChange={onChange} />);

    const lngInput = screen.getByLabelText('Longitude');
    const latInput = screen.getByLabelText('Latitude');

    expect(lngInput).toHaveValue(-122.4194);
    expect(latInput).toHaveValue(37.7749);

    fireEvent.change(lngInput, { target: { value: '-122.4000' } });
    expect(onChange).toHaveBeenCalledWith([-122.4, 37.7749]);

    fireEvent.change(latInput, { target: { value: '37.8000' } });
    expect(onChange).toHaveBeenCalledWith([-122.4194, 37.8]);
  });
});

describe('VisualCardSelect', () => {
  it('renders options, displays badges, and handles clicks on enabled options', () => {
    const onChange = vi.fn();
    render(
      <VisualCardSelect
        options={[
          { value: 'solid', label: 'Solid' },
          { value: 'dashed', label: 'Dashed', badge: 'PRO' },
          { value: 'dotted', label: 'Dotted', disabled: true },
        ]}
        value="solid"
        onChange={onChange}
        columns={3}
      />
    );

    expect(screen.getByText('Solid')).toBeInTheDocument();
    expect(screen.getByText('Dashed')).toBeInTheDocument();
    expect(screen.getByText('PRO')).toBeInTheDocument();
    expect(screen.getByText('Dotted')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Dashed'));
    expect(onChange).toHaveBeenCalledWith('dashed');

    fireEvent.click(screen.getByText('Dotted'));
    expect(onChange).not.toHaveBeenCalledWith('dotted');
  });
});

describe('VisualCardSelect preview', () => {
  it('shows a preview above the label', () => {
    render(
      <VisualCardSelect
        options={[
          { value: 'a', label: 'Alpha', preview: <svg data-testid="preview-a" /> },
          { value: 'b', label: 'Beta' },
        ]}
        value="a"
        onChange={() => {}}
      />
    );
    const preview = screen.getByTestId('preview-a');
    const label = screen.getByText('Alpha');
    expect(preview.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId('preview-b')).not.toBeInTheDocument();
  });

  it('gives a render function the selected state', () => {
    const preview = vi.fn(({ selected }: { selected: boolean }) => (
      <span data-testid="p">{selected ? 'on' : 'off'}</span>
    ));
    const { rerender } = render(
      <VisualCardSelect options={[{ value: 'a', label: 'Alpha', preview }]} value="a" onChange={() => {}} />
    );
    expect(screen.getByTestId('p')).toHaveTextContent('on');
    rerender(<VisualCardSelect options={[{ value: 'a', label: 'Alpha', preview }]} value="b" onChange={() => {}} />);
    expect(screen.getByTestId('p')).toHaveTextContent('off');
  });

  it('selecting the card still works through the preview', () => {
    const onChange = vi.fn();
    render(
      <VisualCardSelect
        options={[{ value: 'a', label: 'Alpha', preview: <svg data-testid="pa" /> }]}
        value="b"
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByTestId('pa'));
    expect(onChange).toHaveBeenCalledWith('a');
  });
});

describe('VisualCardSelect locked options', () => {
  it('sends plan-locked options to onLockedSelect instead of onChange', () => {
    const onChange = vi.fn();
    const onLockedSelect = vi.fn();
    render(
      <VisualCardSelect
        options={[
          { value: 'dot', label: 'Dot' },
          { value: 'car', label: 'Car', badge: 'PRO', locked: true },
        ]}
        value="dot"
        onChange={onChange}
        onLockedSelect={onLockedSelect}
      />
    );

    const car = screen.getByText('Car').closest('button')!;
    expect(car).not.toBeDisabled();
    fireEvent.click(car);
    expect(onLockedSelect).toHaveBeenCalledWith('car');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('(i) tips on shared controls', () => {
  it('SwitchRow shows its sublabel on hover, and the tip does not toggle the switch', async () => {
    const onChange = vi.fn();
    render(<SwitchRow label="Glow" sublabel="Adds a soft glow." checked={false} onChange={onChange} />);
    const tip = screen.getByRole('button', { name: 'More info' });
    fireEvent.click(tip);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Adds a soft glow.');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Glow').compareDocumentPosition(tip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('SwitchRow has no tip without a sublabel', () => {
    render(<SwitchRow label="Glow" checked={false} onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'More info' })).toBeNull();
  });

  it('Field shows its hint in an (i) tip after the label', async () => {
    const { container } = render(<Field label="Projection" hint="Globe is round."><input aria-label="p" /></Field>);
    expect(container.querySelector('[data-slot="field-hint"]')).toBeNull();
    expect(screen.queryByText('Globe is round.')).toBeNull();
    const tip = screen.getByRole('button', { name: 'More info' });
    expect(screen.getByText('Projection').compareDocumentPosition(tip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The tip is not part of the label element, so it cannot become the control the label points at.
    expect(screen.getByText('Projection').closest('label')?.contains(tip)).toBe(false);
    fireEvent.focus(tip);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Globe is round.');
  });

  it('Field without a hint has no tip', () => {
    render(<Field label="Projection"><input aria-label="p" /></Field>);
    expect(screen.queryByRole('button', { name: 'More info' })).toBeNull();
  });
});

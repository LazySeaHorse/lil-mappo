import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  TimingControls,
  EasingSelect,
  SliderRow,
  ColorRow,
  SwitchRow,
  SelectRow,
  NumberRow,
  CoordinatesRows,
  VisualCardSelect,
  EditableTitle,
  normalizeEasing,
  formatPercent,
  formatDegrees,
  formatMultiplier,
  formatDecimals,
  EASING_OPTIONS,
} from './InspectorShared';

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

describe('ColorRow', () => {
  it('renders label and color picker', () => {
    const onChange = vi.fn();
    render(<ColorRow label="Border color" value="#ff0000" onChange={onChange} />);

    expect(screen.getByText('Border color')).toBeInTheDocument();
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
    expect(screen.getByText('Adds soft glow effect')).toBeInTheDocument();

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

describe('TimingControls', () => {
  it('computes duration correctly and adjusts end time when start time changes', () => {
    const onChangeTime = vi.fn();
    render(
      <TimingControls
        startTime={2.0}
        endTime={6.0}
        onChangeTime={onChangeTime}
      />
    );

    const startInput = screen.getByLabelText('Start time');
    const durationInput = screen.getByLabelText('Duration');

    expect(startInput).toHaveValue(2);
    expect(durationInput).toHaveValue(4);

    // Shift start time to 3.0 -> with duration 4.0, new end should be 7.0
    fireEvent.change(startInput, { target: { value: '3' } });
    expect(onChangeTime).toHaveBeenCalledWith(3, 7);
  });

  it('adjusts end time when duration changes', () => {
    const onChangeTime = vi.fn();
    render(
      <TimingControls
        startTime={1.5}
        endTime={4.5}
        onChangeTime={onChangeTime}
      />
    );

    const durationInput = screen.getByLabelText('Duration');
    expect(durationInput).toHaveValue(3);

    // Change duration to 5.0 -> new end should be 1.5 + 5.0 = 6.5
    fireEvent.change(durationInput, { target: { value: '5' } });
    expect(onChangeTime).toHaveBeenCalledWith(1.5, 6.5);
  });

  it('renders easing and exit animation controls when enabled', () => {
    const onChangeTime = vi.fn();
    const onChangeEasing = vi.fn();
    const onChangeExitAnimation = vi.fn();

    render(
      <TimingControls
        startTime={0}
        endTime={5}
        onChangeTime={onChangeTime}
        easing="easeInOutSine"
        onChangeEasing={onChangeEasing}
        exitAnimation="fade"
        onChangeExitAnimation={onChangeExitAnimation}
        showExitAnimation={true}
      />
    );

    expect(screen.getByText('Motion')).toBeInTheDocument();
    expect(screen.getByText('After end')).toBeInTheDocument();
    expect(screen.getByText('Fade out')).toBeInTheDocument();
  });
});

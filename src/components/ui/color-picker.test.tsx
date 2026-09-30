import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ColorPicker, DEFAULT_COLOR_PRESETS, normalizeHex, isValidHex } from './color-picker';

describe('ColorPicker utilities', () => {
  it('validates hex codes accurately', () => {
    expect(isValidHex('#3b82f6')).toBe(true);
    expect(isValidHex('3b82f6')).toBe(true);
    expect(isValidHex('#fff')).toBe(true);
    expect(isValidHex('fff')).toBe(true);
    expect(isValidHex('')).toBe(false);
    expect(isValidHex('invalid')).toBe(false);
    expect(isValidHex('#12345')).toBe(false);
  });

  it('normalizes hex codes to lowercase 6-digit hex format', () => {
    expect(normalizeHex('#3B82F6')).toBe('#3b82f6');
    expect(normalizeHex('3B82F6')).toBe('#3b82f6');
    expect(normalizeHex('#FFF')).toBe('#ffffff');
    expect(normalizeHex('fff')).toBe('#ffffff');
  });
});

describe('ColorPicker component', () => {
  it('renders all default color preset swatches and rainbow wheel button', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#3b82f6" onChange={onChange} />);

    DEFAULT_COLOR_PRESETS.forEach((preset) => {
      expect(screen.getByLabelText(`Select color ${preset}`)).toBeInTheDocument();
    });

    expect(screen.getByLabelText('More colors')).toBeInTheDocument();
  });

  it('calls onChange when a preset color swatch is clicked', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#3b82f6" onChange={onChange} />);

    const redPreset = screen.getByLabelText('Select color #ef4444');
    fireEvent.click(redPreset);

    expect(onChange).toHaveBeenCalledWith('#ef4444');
  });

  it('indicates active preset swatch with aria-pressed', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#22c55e" onChange={onChange} />);

    const greenPreset = screen.getByLabelText('Select color #22c55e');
    expect(greenPreset).toHaveAttribute('aria-pressed', 'true');

    const bluePreset = screen.getByLabelText('Select color #3b82f6');
    expect(bluePreset).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders custom color swatch when current value is not in presets', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#94a3b8" onChange={onChange} />);

    const customSwatch = screen.getByLabelText('Custom color #94a3b8');
    expect(customSwatch).toBeInTheDocument();
    expect(customSwatch).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens popover when rainbow wheel is clicked, exposing manual hex input and color picker', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#3b82f6" onChange={onChange} />);

    const moreColorsBtn = screen.getByLabelText('More colors');
    fireEvent.click(moreColorsBtn);

    const hexInput = screen.getByLabelText('Hex color value');
    expect(hexInput).toBeInTheDocument();

    const spectrumPicker = screen.getByLabelText('Color spectrum picker');
    expect(spectrumPicker).toBeInTheDocument();
  });

  it('updates color when typing a valid hex in manual hex input', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#3b82f6" onChange={onChange} />);

    fireEvent.click(screen.getByLabelText('More colors'));
    const hexInput = screen.getByLabelText('Hex color value');

    fireEvent.change(hexInput, { target: { value: '#ff00aa' } });
    expect(onChange).toHaveBeenCalledWith('#ff00aa');
  });

  it('resets hex input on blur if input was invalid', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#3b82f6" onChange={onChange} />);

    fireEvent.click(screen.getByLabelText('More colors'));
    const hexInput = screen.getByLabelText('Hex color value') as HTMLInputElement;

    fireEvent.change(hexInput, { target: { value: 'not-a-color' } });
    fireEvent.blur(hexInput);

    expect(hexInput.value).toBe('#3b82f6');
  });

  it('allows custom presets array to be passed', () => {
    const onChange = vi.fn();
    const customPresets = ['#111111', '#222222'];
    render(<ColorPicker value="#111111" onChange={onChange} presets={customPresets} />);

    expect(screen.getByLabelText('Select color #111111')).toBeInTheDocument();
    expect(screen.getByLabelText('Select color #222222')).toBeInTheDocument();
    expect(screen.queryByLabelText('Select color #3b82f6')).not.toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MapStylePicker } from './MapStylePicker';
import { existsSync } from 'node:fs';
import { MAP_STYLES } from '@/config/mapbox';

describe('MapStylePicker', () => {
  it('shows the current style and lists every style until a mood is picked', async () => {
    render(<MapStylePicker value="streets" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Map style: Streets' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Map style: Streets' }));
    expect(screen.getAllByRole('radio')).toHaveLength(Object.keys(MAP_STYLES).length);
    expect(screen.getByRole('radio', { name: /^Streets/ })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Imagery' }));
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual([
      expect.stringContaining('Satellite'),
      expect.stringContaining('Satellite Streets'),
    ]);
  });

  it('picks a style and closes', async () => {
    const onChange = vi.fn();
    render(<MapStylePicker value="streets" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Map style: Streets' }));
    fireEvent.click(screen.getByRole('radio', { name: /Neon Glow/ }));
    expect(onChange).toHaveBeenCalledWith('neonGlow');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('has a screenshot for every style and for each time of day of Standard', () => {
    const files = [...Object.keys(MAP_STYLES), 'standard-dawn', 'standard-dusk', 'standard-night'];
    for (const file of files) {
      expect(existsSync(`public/map-styles/${file}.webp`), file).toBe(true);
    }
  });

  it('marks Standard with 3D buildings and its four times of day', () => {
    render(<MapStylePicker value="streets" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Map style: Streets' }));
    const standard = screen.getByRole('radio', { name: /^Standard/ });
    expect(standard.textContent).toMatch(/3D buildings/);
    expect(Array.from(standard.querySelectorAll('img[alt]')).map((i) => i.getAttribute('alt')).filter(Boolean)).toEqual(['Day', 'Dawn', 'Dusk', 'Night']);
  });
});

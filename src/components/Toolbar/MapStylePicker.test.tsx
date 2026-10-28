import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { toast } from 'sonner';
import { MapStylePicker, THUMBNAIL_FILES } from './MapStylePicker';
import { MAP_STYLES } from '@/config/mapbox';
import { SAVED_MAP_STYLES_STORAGE_KEY, useSavedMapStyles } from '@/customMapStyles/savedStyles';
import { useCustomStylesAllowed } from '@/customMapStyles/useCustomStylesAllowed';
import type { CustomMapStyle } from '@/customMapStyles/model';
import { useProjectStore } from '@/store/useProjectStore';

vi.mock('@/customMapStyles/useCustomStylesAllowed', () => ({ useCustomStylesAllowed: vi.fn(() => true) }));
vi.mock('sonner', () => ({ toast: vi.fn() }));

const ink: CustomMapStyle = { name: 'Ink', colors: { land: '#101820' }, theme: 'default' };
const paper: CustomMapStyle = { name: 'Paper', colors: { land: '#f2e8d5' }, theme: 'faded' };

beforeEach(() => {
  vi.mocked(useCustomStylesAllowed).mockReturnValue(true);
  vi.mocked(toast).mockClear();
  localStorage.removeItem(SAVED_MAP_STYLES_STORAGE_KEY);
  useSavedMapStyles.getState().reload();
  useProjectStore.getState().setMapStyle('streets');
});

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
      expect(THUMBNAIL_FILES, file).toContain(file);
    }
  });

  it('marks Standard with 3D buildings and its four times of day', () => {
    render(<MapStylePicker value="streets" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Map style: Streets' }));
    const standard = screen.getByRole('radio', { name: /^Standard/ });
    expect(standard.textContent).toMatch(/3D buildings/);
    expect(Array.from(standard.querySelectorAll('img[alt]')).map((i) => i.getAttribute('alt')).filter(Boolean)).toEqual(['Day', 'Dawn', 'Dusk', 'Night']);
  });

  it('expands in place inside a menu', () => {
    const onChange = vi.fn();
    render(<MapStylePicker variant="inline" value="streets" onChange={onChange} />);
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Map style: Streets' }));
    fireEvent.click(screen.getByRole('radio', { name: /Vintage/ }));
    expect(onChange).toHaveBeenCalledWith('vintage');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  describe('custom styles', () => {
    const open = (name: string) => fireEvent.click(screen.getByRole('button', { name: `Map style: ${name}` }));

    it('shows the custom style in the trigger, and no built-in style as the one in use', () => {
      useProjectStore.getState().setMapStyle('light', ink);
      render(<MapStylePicker value="light" onChange={() => {}} />);
      open('Ink');
      expect(screen.getByRole('radio', { name: /^Light/ })).toHaveAttribute('aria-checked', 'false');
    });

    it('lists saved styles first, and applies one with its base style', () => {
      useSavedMapStyles.getState().save('light', ink);
      useSavedMapStyles.getState().save('standard', paper);
      render(<MapStylePicker value="streets" onChange={() => {}} />);
      open('Streets');

      const saved = within(screen.getByRole('group', { name: 'Your styles' }));
      expect(saved.getAllByRole('button', { pressed: false }).map((b) => b.textContent)).toEqual([
        expect.stringContaining('PaperBased on Standard'),
        expect.stringContaining('InkBased on Light'),
      ]);
      fireEvent.click(saved.getByRole('button', { name: /^Ink/ }));
      expect(useProjectStore.getState()).toMatchObject({ mapStyle: 'light', customStyle: ink });
      expect(screen.queryByRole('group', { name: 'Your styles' })).not.toBeInTheDocument();

      open('Ink');
      expect(screen.getByRole('button', { name: /^Ink/, pressed: true })).toBeInTheDocument();
    });

    it('deletes a saved style, and puts it back from the toast', () => {
      useSavedMapStyles.getState().save('light', ink);
      useSavedMapStyles.getState().save('standard', paper);
      render(<MapStylePicker value="streets" onChange={() => {}} />);
      open('Streets');

      fireEvent.click(screen.getByRole('button', { name: 'Delete Ink' }));
      expect(useSavedMapStyles.getState().styles.map((s) => s.style.name)).toEqual(['Paper']);
      const [message, options] = vi.mocked(toast).mock.calls[0] as unknown as [string, { action: { label: string; onClick: () => void } }];
      expect(message).toBe('Deleted Ink.');
      options.action.onClick();
      expect(useSavedMapStyles.getState().styles.map((s) => s.style.name)).toEqual(['Paper', 'Ink']);
    });

    it('hides saved styles from free plans', () => {
      vi.mocked(useCustomStylesAllowed).mockReturnValue(false);
      useSavedMapStyles.getState().save('light', ink);
      render(<MapStylePicker value="streets" onChange={() => {}} />);
      open('Streets');
      expect(screen.queryByRole('group', { name: 'Your styles' })).not.toBeInTheDocument();
    });
  });
});

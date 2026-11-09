import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/annotations/styles/index';
import { getAllStyles, getCategories } from '@/annotations/registry';
import { useProjectStore } from '@/store/useProjectStore';
import { useUiPreferencesStore } from '@/store/useUiPreferencesStore';
import { CALLOUT_STYLE_STORAGE_KEY } from '@/store/calloutStylePreference';
import { StylePicker } from './StylePicker';

const { getStylePreview } = vi.hoisted(() => ({ getStylePreview: vi.fn() }));
vi.mock('./stylePreview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./stylePreview')>()),
  getStylePreview,
}));
// The animated previews draw on a canvas; here they only say what they show.
vi.mock('./AnimatedStylePreview', () => ({
  AnimatedStylePreview: ({ styleId, text, subtitle }: { styleId: string; text: string; subtitle?: string }) => (
    <div data-testid="animated-preview">{subtitle ? `${styleId}|${text}|${subtitle}` : `${styleId}|${text}`}</div>
  ),
}));

/** Styles in the order the dialog lists them: by category. */
const listed = () => getCategories().flatMap((category) => getAllStyles().filter((s) => s.category === category));
const previews = () => screen.getAllByTestId('animated-preview').map((el) => el.textContent);

describe('StylePicker', () => {
  beforeEach(() => {
    getStylePreview.mockReset();
    getStylePreview.mockResolvedValue('data:image/png;base64,AAAA');
    useProjectStore.setState({ mapStyle: 'standard', lightPreset: 'day' });
    useUiPreferencesStore.setState({ defaultCalloutStyle: null });
    localStorage.removeItem(CALLOUT_STYLE_STORAGE_KEY);
  });

  it('names no style and marks none as current while the callouts differ', () => {
    render(<StylePicker value={null} onChange={() => {}} />);
    expect(screen.getByText('Mixed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));

    expect(previews()).toHaveLength(1);
    expect(within(screen.getByRole('listbox', { name: 'Styles' })).queryByText('Now')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use style' })).toBeEnabled();
  });

  it('sets the style being looked at as the default for new callouts, without applying it', () => {
    const onChange = vi.fn();
    render(<StylePicker value="leader-line" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.click(screen.getByRole('option', { name: 'Waypoint' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set as default' }));

    expect(useUiPreferencesStore.getState().defaultCalloutStyle).toBe('waypoint');
    expect(localStorage.getItem(CALLOUT_STYLE_STORAGE_KEY)).toBe('waypoint');
    expect(screen.getByRole('button', { name: 'Default' })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('marks the built-in style as the default until another is chosen', () => {
    render(<StylePicker value="waypoint" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.click(screen.getByRole('option', { name: 'Leader Line' }));
    expect(screen.getByRole('button', { name: 'Default' })).toBeDisabled();
    fireEvent.click(screen.getByRole('option', { name: 'Waypoint Now' }));
    expect(screen.getByRole('button', { name: 'Set as default' })).toBeEnabled();
  });

  it('shows the style name with a Change button, and no dialog', () => {
    render(<StylePicker value="leader-line" onChange={() => {}} />);
    expect(screen.getByText('Leader Line')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a dialog listing every style, the current one marked Now', () => {
    render(<StylePicker value="leader-line" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    const dialog = screen.getByRole('dialog', { name: 'Callout style' });
    const names = within(dialog).getAllByRole('option').map((option) => option.textContent);
    expect(names).toEqual(listed().map((s) => (s.id === 'leader-line' ? `${s.name}Now` : s.name)));
  });

  it('puts Mappo holding a callout at the top of the dialog', () => {
    render(<StylePicker value="leader-line" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    const hero = screen.getByRole('dialog', { name: 'Callout style' }).firstElementChild;
    expect(hero?.getAttribute('data-slot')).toBe('pin-drop');
    expect(hero?.getAttribute('data-scene')).toBe('callouts');
    expect(hero?.querySelector('svg[data-mood="callout"]')).not.toBeNull();
  });

  it('plays the current style beside the next one in the list, with the callout title', () => {
    render(<StylePicker value="leader-line" onChange={() => {}} title="Eiffel Tower" />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    const next = listed()[listed().findIndex((s) => s.id === 'leader-line') + 1];
    expect(previews()).toEqual(['leader-line|Eiffel Tower', `${next.id}|Eiffel Tower`]);
    expect(screen.getByRole('option', { selected: true })).toHaveAccessibleName(next.name);
  });

  it('gives both previews the callout subtitle', () => {
    render(<StylePicker value="leader-line" onChange={() => {}} title="Eiffel Tower" subtitle=" Paris, France " />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.click(screen.getByRole('option', { name: 'Pole Label' }));
    expect(previews()).toEqual(['leader-line|Eiffel Tower|Paris, France', 'pole-label|Eiffel Tower|Paris, France']);
  });

  it('shows a chosen style beside the current one without applying it', () => {
    const onChange = vi.fn();
    render(<StylePicker value="leader-line" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.click(screen.getByRole('option', { name: 'Waypoint' }));
    expect(previews()).toEqual(['leader-line|Paris', 'waypoint|Paris']);
    expect(screen.getByRole('option', { name: 'Waypoint' })).toHaveAttribute('aria-selected', 'true');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies the chosen style with Use style and closes', () => {
    const onChange = vi.fn();
    render(<StylePicker value="leader-line" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.click(screen.getByRole('option', { name: 'Waypoint' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use style' }));
    expect(onChange).toHaveBeenCalledWith('waypoint');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cannot apply the style the callout already has', () => {
    const onChange = vi.fn();
    render(<StylePicker value="leader-line" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.click(screen.getByRole('option', { name: 'Leader Line Now' }));
    expect(screen.getByRole('button', { name: 'In use' })).toBeDisabled();
  });

  it('moves through the list with the arrow keys', () => {
    render(<StylePicker value="leader-line" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.click(screen.getByRole('option', { name: 'Waypoint' }));
    fireEvent.keyDown(screen.getByRole('option', { name: 'Waypoint' }), { key: 'ArrowDown' });
    const next = listed()[listed().findIndex((s) => s.id === 'waypoint') + 1];
    expect(previews()[1]).toBe(`${next.id}|Paris`);
  });

  it('keeps keys typed in the dialog from reaching what holds the picker', () => {
    const onKeyDown = vi.fn();
    render(<div onKeyDown={onKeyDown}><StylePicker value="leader-line" onChange={() => {}} /></div>);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.keyDown(screen.getByRole('option', { name: 'Waypoint' }), { key: 'ArrowDown' });
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('draws the folded picture with the callout title, or Paris when the title is empty', async () => {
    const { rerender } = render(<StylePicker value="leader-line" onChange={() => {}} title="Eiffel Tower" />);
    await waitFor(() => expect(getStylePreview).toHaveBeenCalledWith('leader-line', 'light', 'Eiffel Tower'));
    rerender(<StylePicker value="leader-line" onChange={() => {}} title="  " />);
    await waitFor(() => expect(getStylePreview).toHaveBeenCalledWith('leader-line', 'light', 'Paris'));
  });

  it('shows the picture once it is drawn, and asks again for the dark theme', async () => {
    const { container } = render(<StylePicker value="leader-line" onChange={() => {}} />);
    await waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,AAAA'));

    useProjectStore.setState({ lightPreset: 'night' });
    await waitFor(() => expect(getStylePreview).toHaveBeenCalledWith('leader-line', 'dark', 'Paris'));
  });

  it('keeps the style icon when a picture cannot be drawn', async () => {
    getStylePreview.mockResolvedValue(null);
    const { container } = render(<StylePicker value="leader-line" onChange={() => {}} />);
    await waitFor(() => expect(getStylePreview).toHaveBeenCalled());
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

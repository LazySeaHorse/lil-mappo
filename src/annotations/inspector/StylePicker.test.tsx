import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/annotations/styles/index';
import { getAllStyles } from '@/annotations/registry';
import { useProjectStore } from '@/store/useProjectStore';
import { StylePicker } from './StylePicker';

const { getStylePreview } = vi.hoisted(() => ({ getStylePreview: vi.fn() }));
vi.mock('./stylePreview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./stylePreview')>()),
  getStylePreview,
}));

describe('StylePicker', () => {
  beforeEach(() => {
    getStylePreview.mockReset();
    getStylePreview.mockResolvedValue('data:image/png;base64,AAAA');
    useProjectStore.setState({ mapStyle: 'standard', lightPreset: 'day' });
  });

  it('starts folded: the style name with a Change button, not the whole list', () => {
    render(<StylePicker value="leader-line" onChange={() => {}} />);
    expect(screen.getByText('Leader Line')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(screen.queryByText('Waypoint')).not.toBeInTheDocument();
  });

  it('opens every style when the user clicks Change', () => {
    render(<StylePicker value="leader-line" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    for (const style of getAllStyles()) expect(screen.getByRole('button', { name: style.name })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
  });

  it('picks a style, tells the parent and folds again', () => {
    const onChange = vi.fn();
    const { rerender } = render(<StylePicker value="leader-line" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Waypoint' }));
    expect(onChange).toHaveBeenCalledWith('waypoint');

    rerender(<StylePicker value="waypoint" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(screen.getByText('Waypoint')).toBeInTheDocument();
    expect(screen.queryByText('Stamp')).not.toBeInTheDocument();
  });

  it('draws the previews with the callout title, or Paris when the title is empty', async () => {
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

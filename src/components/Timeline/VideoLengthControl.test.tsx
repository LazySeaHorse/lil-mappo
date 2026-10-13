import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import { ProjectSettings } from '@/components/Inspector/ProjectSettings';
import { DURATION_TERMS } from '@/lib/terms';
import { VideoLengthControl } from './VideoLengthControl';

vi.mock('react-secure-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
const subscription = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: subscription.current }) }));

const paid = { tier: 'wanderer', status: 'active' };

beforeEach(() => {
  subscription.current = paid;
  vi.mocked(toast.info).mockClear();
  useProjectStore.setState({ duration: 10, playheadTime: 0, isPlaying: false, projectSettingsTab: 'general' });
});

const open = () => fireEvent.click(screen.getByRole('button', { name: new RegExp(DURATION_TERMS.change) }));
const field = () => screen.getByRole('textbox', { name: DURATION_TERMS.change });

describe('VideoLengthControl', () => {
  it('shows the length as a button with a tooltip', () => {
    render(<VideoLengthControl />);
    const button = screen.getByRole('button', { name: new RegExp(DURATION_TERMS.change) });
    expect(button).toHaveAttribute('title', DURATION_TERMS.change);
    expect(button).toHaveTextContent('00:10.00');
    expect(button.tagName).toBe('BUTTON');
  });

  it('opens an input with the current length on click', () => {
    render(<VideoLengthControl />);
    open();
    expect(field()).toHaveValue('00:10.00');
    expect(field()).toHaveFocus();
  });

  it('applies on Enter', () => {
    render(<VideoLengthControl />);
    open();
    fireEvent.change(field(), { target: { value: '25' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(useProjectStore.getState().duration).toBe(25);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(DURATION_TERMS.change) })).toHaveTextContent('00:25.00');
  });

  it('applies on blur', () => {
    render(<VideoLengthControl />);
    open();
    fireEvent.change(field(), { target: { value: '12.5' } });
    fireEvent.blur(field());
    expect(useProjectStore.getState().duration).toBe(12.5);
  });

  it('cancels on Escape', () => {
    render(<VideoLengthControl />);
    open();
    fireEvent.change(field(), { target: { value: '25' } });
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(useProjectStore.getState().duration).toBe(10);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('reads minutes and seconds', () => {
    render(<VideoLengthControl />);
    open();
    fireEvent.change(field(), { target: { value: '1:05' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(useProjectStore.getState().duration).toBe(65);
  });

  it('drops text that is not a time', () => {
    render(<VideoLengthControl />);
    open();
    fireEvent.change(field(), { target: { value: 'soon' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(useProjectStore.getState().duration).toBe(10);
  });

  it('keeps the plan limit, as the settings panel does', () => {
    subscription.current = null;
    render(<VideoLengthControl />);
    open();
    fireEvent.change(field(), { target: { value: '90' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(useProjectStore.getState().duration).toBe(30);
    expect(toast.info).toHaveBeenCalledWith(DURATION_TERMS.limit(30));
  });

  it('gives the same result as the settings panel field', () => {
    subscription.current = null;
    const { unmount } = render(<ProjectSettings />);
    fireEvent.change(screen.getByLabelText('Duration (s)'), { target: { value: '90' } });
    const fromPanel = useProjectStore.getState().duration;
    unmount();

    act(() => useProjectStore.setState({ duration: 10 }));
    render(<VideoLengthControl />);
    open();
    fireEvent.change(field(), { target: { value: '90' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(useProjectStore.getState().duration).toBe(fromPanel);
  });
});

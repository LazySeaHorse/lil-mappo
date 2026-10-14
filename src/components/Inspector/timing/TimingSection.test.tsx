import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TimingSection } from './TimingSection';
import { boundaryTiming, calloutTiming, cameraViewTiming, routeTiming } from './timingAdapters';
import { useProjectStore } from '@/store/useProjectStore';
import {
  createBoundaryItem,
  createCalloutItem,
  createCameraKeyframe,
  createEndpointRouteItem,
} from '@/store/itemFactories';
import { useUiPreferencesStore } from '@/store/useUiPreferencesStore';
import '@/annotations/styles/index';

const line: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }],
};

const route = createEndpointRouteItem({ mode: 'car', geojson: line, start: [0, 0], end: [1, 1], name: 'R', startTime: 2, endTime: 6 });
const boundary = createBoundaryItem({ placeName: 'Spain', geojson: null, startTime: 1, endTime: 4 });
const callout = createCalloutItem({ styleId: 'leader-line', content: { title: 'Pier' }, lngLat: [0, 0], startTime: 1, endTime: 6 })!;
const kf = createCameraKeyframe({ time: 2.5, center: [0, 0], zoom: 5 });

beforeEach(() => {
  useUiPreferencesStore.setState({ inspectorSections: {} });
  useProjectStore.setState({ playheadTime: 0 });
});

describe('TimingSection fields', () => {
  it('shows every field a route supports', () => {
    render(<TimingSection adapter={routeTiming} item={route} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Timing' })).toBeInTheDocument();
    expect(screen.getByLabelText('Start')).toHaveValue('00:02.00');
    expect(screen.getByRole('button', { name: 'Start: Set to the playhead time' })).toBeInTheDocument();
    expect(screen.getByLabelText('End')).toHaveValue('00:06.00');
    expect(screen.getByRole('button', { name: 'End: Set to the playhead time' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'At playhead' })).not.toBeInTheDocument();
    expect(screen.getByText('Length')).toBeInTheDocument();
    expect(screen.getByText('4.00 s')).toBeInTheDocument();
    expect(screen.getByText('Motion')).toBeInTheDocument();
    expect(screen.getByText('When it ends')).toBeInTheDocument();
    expect(screen.queryByText('Enter')).not.toBeInTheDocument();
  });

  it('hides "when it ends" when the route does not draw itself', () => {
    const item = { ...route, style: { ...route.style, animationType: 'navigation' as const } };
    render(<TimingSection adapter={routeTiming} item={item} onChange={vi.fn()} />);
    expect(screen.queryByText('When it ends')).not.toBeInTheDocument();
    expect(screen.getByText('Motion')).toBeInTheDocument();
  });

  it('shows the enter and exit animation for a callout, and no motion', () => {
    render(<TimingSection adapter={calloutTiming} item={callout} onChange={vi.fn()} />);
    expect(screen.getByText('5.00 s')).toBeInTheDocument();
    expect(screen.getByText('Enter')).toBeInTheDocument();
    expect(screen.getByText('Enter duration')).toBeInTheDocument();
    expect(screen.getByText('Exit')).toBeInTheDocument();
    expect(screen.getByText('Exit duration')).toBeInTheDocument();
    expect(screen.queryByText('Motion')).not.toBeInTheDocument();
    expect(screen.queryByText('When it ends')).not.toBeInTheDocument();
  });

  it('shows only the start and motion for a camera view', () => {
    render(<TimingSection adapter={cameraViewTiming} item={kf} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Start')).toHaveValue('00:02.50');
    expect(screen.getByRole('button', { name: 'Start: Set to the playhead time' })).toBeInTheDocument();
    expect(screen.getByText('Motion')).toBeInTheDocument();
    expect(screen.queryByLabelText('End')).not.toBeInTheDocument();
    expect(screen.queryByText('Length')).not.toBeInTheDocument();
  });

  it('can be collapsed like any section', () => {
    render(<TimingSection adapter={boundaryTiming} item={boundary} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Timing' }));
    expect(screen.queryByLabelText('Start')).not.toBeInTheDocument();
  });
});

describe('TimingSection edits', () => {
  it('writes a new start through the adapter', () => {
    const onChange = vi.fn();
    render(<TimingSection adapter={routeTiming} item={route} onChange={onChange} />);
    const input = screen.getByLabelText('Start');
    fireEvent.change(input, { target: { value: '00:03.00' } });
    // Nothing is written while the user types.
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith({ startTime: 3, endTime: 6 });
  });

  it('accepts plain seconds and Enter', () => {
    const onChange = vi.fn();
    render(<TimingSection adapter={routeTiming} item={route} onChange={onChange} />);
    const input = screen.getByLabelText('Start');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith({ startTime: 5, endTime: 6 });
  });

  it('puts back the old time when the text is not a time', () => {
    const onChange = vi.fn();
    render(<TimingSection adapter={routeTiming} item={route} onChange={onChange} />);
    const input = screen.getByLabelText('Start');
    fireEvent.change(input, { target: { value: 'soon' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('00:02.00');
  });

  it('the Start playhead button sets the start and keeps the end', () => {
    useProjectStore.setState({ playheadTime: 3.5 });
    const onChange = vi.fn();
    render(<TimingSection adapter={routeTiming} item={route} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start: Set to the playhead time' }));
    expect(onChange).toHaveBeenCalledWith({ startTime: 3.5, endTime: 6 });
  });

  it('the Start playhead button moves the item when the playhead is past the end', () => {
    useProjectStore.setState({ playheadTime: 8 });
    const onChange = vi.fn();
    render(<TimingSection adapter={routeTiming} item={route} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start: Set to the playhead time' }));
    expect(onChange).toHaveBeenCalledWith({ startTime: 8, endTime: 12 });
  });

  it('the End playhead button sets the end and keeps the start', () => {
    useProjectStore.setState({ playheadTime: 4.25 });
    const onChange = vi.fn();
    render(<TimingSection adapter={routeTiming} item={route} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'End: Set to the playhead time' }));
    expect(onChange).toHaveBeenCalledWith({ startTime: 2, endTime: 4.25 });
  });

  it('the End playhead button moves the item when the playhead is before the start', () => {
    useProjectStore.setState({ playheadTime: 1 });
    const onChange = vi.fn();
    render(<TimingSection adapter={routeTiming} item={route} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'End: Set to the playhead time' }));
    // Length 4 s ending at 1 s would start before 0, so the start stops at 0.
    expect(onChange).toHaveBeenCalledWith({ startTime: 0, endTime: 4 });
  });

  it('the playhead button sets the time of a camera view', () => {
    useProjectStore.setState({ playheadTime: 1.25 });
    const onChange = vi.fn();
    render(<TimingSection adapter={cameraViewTiming} item={kf} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start: Set to the playhead time' }));
    expect(onChange).toHaveBeenCalledWith({ time: 1.25 });
  });

  it('writes a new end and keeps the start', () => {
    const onChange = vi.fn();
    render(<TimingSection adapter={routeTiming} item={route} onChange={onChange} />);
    const input = screen.getByLabelText('End');
    fireEvent.change(input, { target: { value: '00:09.00' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith({ startTime: 2, endTime: 9 });
  });

  it('a new start keeps the end where it is', () => {
    const onChange = vi.fn();
    render(<TimingSection adapter={routeTiming} item={route} onChange={onChange} />);
    const input = screen.getByLabelText('Start');
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith({ startTime: 4, endTime: 6 });
  });

  it('puts back the old time when the end would be at or before the start', () => {
    const onChange = vi.fn();
    render(<TimingSection adapter={routeTiming} item={route} onChange={onChange} />);
    const end = screen.getByLabelText('End');
    fireEvent.change(end, { target: { value: '1' } });
    fireEvent.blur(end);
    expect(onChange).not.toHaveBeenCalled();
    expect(end).toHaveValue('00:06.00');
    const start = screen.getByLabelText('Start');
    fireEvent.change(start, { target: { value: '6' } });
    fireEvent.blur(start);
    expect(onChange).not.toHaveBeenCalled();
    expect(start).toHaveValue('00:02.00');
  });

  it('the length is shown, not edited, and follows the item', () => {
    const { rerender } = render(<TimingSection adapter={routeTiming} item={route} onChange={vi.fn()} />);
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Length')).not.toBeInTheDocument();
    rerender(<TimingSection adapter={routeTiming} item={{ ...route, endTime: 7.5 }} onChange={vi.fn()} />);
    expect(screen.getByText('5.50 s')).toBeInTheDocument();
    expect(screen.getByLabelText('End')).toHaveValue('00:07.50');
  });

  it('puts the titles above the fields, with Start and End side by side', () => {
    render(<TimingSection adapter={routeTiming} item={route} onChange={vi.fn()} />);
    const start = screen.getByLabelText('Start');
    const end = screen.getByLabelText('End');
    const grid = start.closest('[data-slot="timing-times"]') as HTMLElement;
    expect(grid.className).toContain('grid-cols-2');
    expect(grid.contains(end)).toBe(true);
    const startCell = start.closest('[data-slot="time-field"]') as HTMLElement;
    expect(startCell.className).toContain('flex-col');
    expect(screen.getByText('Start').compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Each field holds its own playhead button.
    expect(startCell.contains(screen.getByRole('button', { name: 'Start: Set to the playhead time' }))).toBe(true);
    expect(end.closest('[data-slot="time-field"]')!.contains(screen.getByRole('button', { name: 'End: Set to the playhead time' }))).toBe(true);
  });

  it('a camera view shows only Start', () => {
    render(<TimingSection adapter={cameraViewTiming} item={kf} onChange={vi.fn()} />);
    const grid = screen.getByLabelText('Start').closest('[data-slot="timing-times"]') as HTMLElement;
    expect(grid.className).not.toContain('grid-cols-2');
  });

  it('puts "When it ends" above the tabs, not beside them', () => {
    render(<TimingSection adapter={routeTiming} item={route} onChange={vi.fn()} />);
    const label = screen.getByText('When it ends');
    const tabs = document.querySelector('[data-slot="segmented-control"]') as HTMLElement;
    const row = label.closest('[data-slot="timing-end-behaviour"]') as HTMLElement;
    expect(row.className).toContain('flex-col');
    expect(row.contains(tabs)).toBe(true);
    expect(label.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The tabs fill the row.
    expect(tabs.className).toContain('w-full');
  });

  it('writes the end behaviour', () => {
    const onChange = vi.fn();
    render(<TimingSection adapter={routeTiming} item={route} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Fade out' }));
    expect(onChange).toHaveBeenCalledWith({ exitAnimation: 'fade' });
  });

  it('writes a callout exit duration into its transition', () => {
    const onChange = vi.fn();
    render(<TimingSection adapter={calloutTiming} item={callout} onChange={onChange} />);
    const slider = screen.getAllByRole('slider')[1];
    slider.focus();
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith({
      transition: { ...callout.transition, exitDuration: expect.any(Number) },
    });
  });
});

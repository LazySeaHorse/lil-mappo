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
    expect(screen.getByLabelText('Starts')).toHaveValue('00:02.00');
    expect(screen.getByRole('button', { name: 'At playhead' })).toBeInTheDocument();
    expect(screen.getByLabelText('Length')).toHaveValue(4);
    expect(screen.getByText('Ends at')).toBeInTheDocument();
    expect(screen.getByText('00:06.00')).toBeInTheDocument();
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
    expect(screen.getByLabelText('Length')).toHaveValue(5);
    expect(screen.getByText('Enter')).toBeInTheDocument();
    expect(screen.getByText('Enter duration')).toBeInTheDocument();
    expect(screen.getByText('Exit')).toBeInTheDocument();
    expect(screen.getByText('Exit duration')).toBeInTheDocument();
    expect(screen.queryByText('Motion')).not.toBeInTheDocument();
    expect(screen.queryByText('When it ends')).not.toBeInTheDocument();
  });

  it('shows only the start and motion for a camera view', () => {
    render(<TimingSection adapter={cameraViewTiming} item={kf} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Starts')).toHaveValue('00:02.50');
    expect(screen.getByRole('button', { name: 'At playhead' })).toBeInTheDocument();
    expect(screen.getByText('Motion')).toBeInTheDocument();
    expect(screen.queryByLabelText('Length')).not.toBeInTheDocument();
    expect(screen.queryByText('Ends at')).not.toBeInTheDocument();
  });

  it('can be collapsed like any section', () => {
    render(<TimingSection adapter={boundaryTiming} item={boundary} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Timing' }));
    expect(screen.queryByLabelText('Starts')).not.toBeInTheDocument();
  });
});

describe('TimingSection edits', () => {
  it('writes a new start through the adapter', () => {
    const onChange = vi.fn();
    render(<TimingSection adapter={routeTiming} item={route} onChange={onChange} />);
    const input = screen.getByLabelText('Starts');
    fireEvent.change(input, { target: { value: '00:03.00' } });
    // Nothing is written while the user types.
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith({ startTime: 3, endTime: 7 });
  });

  it('accepts plain seconds and Enter', () => {
    const onChange = vi.fn();
    render(<TimingSection adapter={routeTiming} item={route} onChange={onChange} />);
    const input = screen.getByLabelText('Starts');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith({ startTime: 5, endTime: 9 });
  });

  it('puts back the old time when the text is not a time', () => {
    const onChange = vi.fn();
    render(<TimingSection adapter={routeTiming} item={route} onChange={onChange} />);
    const input = screen.getByLabelText('Starts');
    fireEvent.change(input, { target: { value: 'soon' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('00:02.00');
  });

  it('At playhead moves the start to the playhead and keeps the length', () => {
    useProjectStore.setState({ playheadTime: 3.5 });
    const onChange = vi.fn();
    render(<TimingSection adapter={routeTiming} item={route} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'At playhead' }));
    expect(onChange).toHaveBeenCalledWith({ startTime: 3.5, endTime: 7.5 });
  });

  it('At playhead sets the time of a camera view', () => {
    useProjectStore.setState({ playheadTime: 1.25 });
    const onChange = vi.fn();
    render(<TimingSection adapter={cameraViewTiming} item={kf} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'At playhead' }));
    expect(onChange).toHaveBeenCalledWith({ time: 1.25 });
  });

  it('changing the length keeps the start, and Ends at follows the item', () => {
    const onChange = vi.fn();
    const { rerender } = render(<TimingSection adapter={routeTiming} item={route} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Length'), { target: { value: '5' } });
    expect(onChange).toHaveBeenCalledWith({ startTime: 2, endTime: 7 });
    rerender(<TimingSection adapter={routeTiming} item={{ ...route, endTime: 7 }} onChange={onChange} />);
    expect(screen.getByText('00:07.00')).toBeInTheDocument();
  });

  it('Ends at is start plus length, formatted as a timeline time', () => {
    const item = { ...boundary, startTime: 0.1, endTime: 2.4 };
    render(<TimingSection adapter={boundaryTiming} item={item} onChange={vi.fn()} />);
    expect(screen.getByText('00:02.40')).toBeInTheDocument();
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

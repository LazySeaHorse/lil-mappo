import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { AirportSearchField } from './AirportSearchField';
import { loadAirports } from '@/services/airports/airportService';

describe('AirportSearchField', () => {
  beforeAll(async () => {
    // Polyfill scrollIntoView for jsdom if not present
    if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = vi.fn();
    }
    // Pre-load airport database so test runs are fast and deterministic
    await loadAirports();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with placeholder', () => {
    render(
      <AirportSearchField
        onSelect={vi.fn()}
        placeholder="Search for an airport or city..."
      />
    );

    const input = screen.getByPlaceholderText('Search for an airport or city...');
    expect(input).toBeInTheDocument();
  });

  it('renders with label as fallback when placeholder is not provided', () => {
    render(
      <AirportSearchField
        onSelect={vi.fn()}
        label="Departure Airport"
      />
    );

    const input = screen.getByPlaceholderText('Departure Airport');
    expect(input).toBeInTheDocument();
  });

  it('shows popular airports when opened with empty query', async () => {
    render(
      <AirportSearchField
        onSelect={vi.fn()}
        placeholder="Search airports"
      />
    );

    const input = screen.getByPlaceholderText('Search airports');
    fireEvent.focus(input);

    // Popular airports like JFK and LHR should be presented
    expect(await screen.findByText('JFK')).toBeInTheDocument();
    expect(screen.getByText('LHR')).toBeInTheDocument();
  });

  it('filters airports by IATA or city when typing', async () => {
    render(
      <AirportSearchField
        onSelect={vi.fn()}
        placeholder="Search airports"
      />
    );

    const input = screen.getByPlaceholderText('Search airports');
    fireEvent.focus(input);

    // Filter by IATA
    fireEvent.change(input, { target: { value: 'JFK' } });
    expect(await screen.findByText(/John F Kennedy/i)).toBeInTheDocument();
    expect(screen.getByText('JFK')).toBeInTheDocument();

    // Filter by city
    fireEvent.change(input, { target: { value: 'Paris' } });
    expect(await screen.findByText(/Charles de Gaulle/i)).toBeInTheDocument();
    expect(screen.getByText('CDG')).toBeInTheDocument();
  });

  it('fires onSelect with [lng, lat] and airport name when selecting an airport', async () => {
    const onSelect = vi.fn();
    render(
      <AirportSearchField
        onSelect={onSelect}
        placeholder="Search airports"
      />
    );

    const input = screen.getByPlaceholderText('Search airports');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'LHR' } });

    const lhrItem = await screen.findByText(/Heathrow/i);
    fireEvent.click(lhrItem);

    expect(onSelect).toHaveBeenCalledTimes(1);
    const [coordinates, name] = onSelect.mock.calls[0];
    expect(name).toContain('Heathrow');
    expect(coordinates[0]).toBeCloseTo(-0.4614, 1);
    expect(coordinates[1]).toBeCloseTo(51.4706, 1);
  });

  it('calls onStartPick when Pick on Map button is clicked', () => {
    const onStartPick = vi.fn();
    render(
      <AirportSearchField
        onSelect={vi.fn()}
        onStartPick={onStartPick}
        placeholder="Search airports"
      />
    );

    const pickButton = screen.getByTitle('Pick on Map');
    fireEvent.click(pickButton);

    expect(onStartPick).toHaveBeenCalledTimes(1);
  });

  it('resets input when clear button is clicked', async () => {
    const onSelect = vi.fn();
    render(
      <AirportSearchField
        onSelect={onSelect}
        placeholder="Search airports"
      />
    );

    const input = screen.getByPlaceholderText('Search airports') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'SFO' } });
    expect(input.value).toBe('SFO');

    const clearButton = screen.getByLabelText('Clear');
    fireEvent.click(clearButton);

    expect(input.value).toBe('');
    expect(onSelect).toHaveBeenCalledWith([0, 0], '');
  });

  it('supports direct coordinate string input', async () => {
    const onSelect = vi.fn();
    render(
      <AirportSearchField
        onSelect={onSelect}
        placeholder="Search airports"
      />
    );

    const input = screen.getByPlaceholderText('Search airports');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '-74.006, 40.712' } });

    const coordItem = await screen.findByText(/Coordinates:/i);
    expect(coordItem).toBeInTheDocument();
    fireEvent.click(coordItem);

    expect(onSelect).toHaveBeenCalledWith(
      [-74.006, 40.712],
      expect.stringContaining('-74.006')
    );
  });

  it('supports keyboard selection with Enter on direct coordinates', async () => {
    const onSelect = vi.fn();
    render(
      <AirportSearchField
        onSelect={onSelect}
        placeholder="Search airports"
      />
    );

    const input = screen.getByPlaceholderText('Search airports');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '-74.006, 40.712' } });

    await screen.findByText(/Coordinates:/i);
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith(
      [-74.006, 40.712],
      expect.stringContaining('-74.006')
    );
  });

  it('closes popover on Escape key press', async () => {
    render(
      <AirportSearchField
        onSelect={vi.fn()}
        placeholder="Search airports"
      />
    );

    const input = screen.getByPlaceholderText('Search airports');
    fireEvent.focus(input);

    expect(await screen.findByText('JFK')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByText('JFK')).not.toBeInTheDocument();
    });
  });
});

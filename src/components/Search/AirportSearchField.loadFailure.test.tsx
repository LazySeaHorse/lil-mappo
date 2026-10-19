import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AirportSearchField } from './AirportSearchField';
import { loadAirports } from '@/services/airports/airportService';

vi.mock('@/services/airports/airportService', () => ({
  loadAirports: vi.fn(),
  searchAirportsSync: vi.fn(() => []),
}));

const mockedLoad = vi.mocked(loadAirports);

describe('AirportSearchField when the airport data fails to load', () => {
  beforeAll(() => {
    if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    mockedLoad.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('says so and lets the user retry', async () => {
    mockedLoad.mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'));
    render(<AirportSearchField onSelect={vi.fn()} placeholder="Search airports" />);

    fireEvent.focus(screen.getByPlaceholderText('Search airports'));
    expect(await screen.findByText(/couldn't load airports/i)).toBeInTheDocument();
    expect(screen.queryByText(/loading airports/i)).not.toBeInTheDocument();

    mockedLoad.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(screen.queryByText(/couldn't load airports/i)).not.toBeInTheDocument());
    expect(mockedLoad).toHaveBeenCalledTimes(2);
  });
});

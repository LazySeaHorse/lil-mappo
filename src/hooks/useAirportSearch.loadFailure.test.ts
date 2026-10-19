import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAirports } from '@/services/airports/airportService';
import { useAirportSearch } from './useAirportSearch';

vi.mock('@/services/airports/airportService', () => ({
  loadAirports: vi.fn(),
  searchAirportsSync: vi.fn(() => []),
}));

const mockedLoad = vi.mocked(loadAirports);

describe('useAirportSearch when the airport data fails to load', () => {
  beforeEach(() => {
    mockedLoad.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('reports the failure, stops loading and does not retry on its own', async () => {
    mockedLoad.mockRejectedValue(new Error('Failed to fetch dynamically imported module'));
    const { result } = renderHook(() => useAirportSearch());

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);

    act(() => result.current.setQuery('lon'));
    act(() => result.current.open());
    expect(mockedLoad).toHaveBeenCalledTimes(1);
  });

  it('retry loads again and clears the error on success', async () => {
    mockedLoad.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useAirportSearch());
    await waitFor(() => expect(result.current.error).toBe(true));

    mockedLoad.mockResolvedValue([]);
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.error).toBe(false));
    expect(result.current.loading).toBe(false);
    expect(mockedLoad).toHaveBeenCalledTimes(2);
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchField } from './SearchField';

const { suggest } = vi.hoisted(() => ({ suggest: vi.fn() }));

vi.mock('@mapbox/search-js-core', () => ({
  SearchBoxCore: class {},
  SearchSession: class {
    suggest = suggest;
    retrieve = vi.fn();
  },
}));

const renderField = () =>
  render(
    <SearchField
      label="Location"
      value={[0, 0]}
      name=""
      onSelect={vi.fn()}
      isPicking={false}
      onStartPick={vi.fn()}
    />,
  );

describe('SearchField', () => {
  beforeEach(() => suggest.mockReset().mockResolvedValue({ suggestions: [] }));

  it('searches on Enter', async () => {
    renderField();
    const input = screen.getByPlaceholderText('Location');
    fireEvent.change(input, { target: { value: 'Central Park' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(suggest).toHaveBeenCalledTimes(1));
  });

  it('has a search button that does the same as Enter', async () => {
    renderField();
    fireEvent.change(screen.getByPlaceholderText('Location'), { target: { value: 'Central Park' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(suggest).toHaveBeenCalledTimes(1));
    expect(suggest.mock.calls[0][0]).toBe('Central Park');
  });

  it('reads typed coordinates only when parseCoordinates is set', async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <SearchField label="Location" value={[0, 0]} name="" onSelect={onSelect} isPicking={false} onStartPick={vi.fn()} />,
    );
    const input = screen.getByPlaceholderText('Location');
    fireEvent.change(input, { target: { value: '-74.0, 40.7' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(suggest).toHaveBeenCalledTimes(1));
    expect(onSelect).not.toHaveBeenCalled();

    suggest.mockClear();
    rerender(
      <SearchField label="Location" value={[0, 0]} name="" onSelect={onSelect} isPicking={false} onStartPick={vi.fn()} parseCoordinates />,
    );
    fireEvent.keyDown(screen.getByPlaceholderText('Location'), { key: 'Enter' });
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith([-74, 40.7], ''));
    expect(suggest).not.toHaveBeenCalled();
  });
});

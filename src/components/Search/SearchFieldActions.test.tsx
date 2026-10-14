import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchFieldActions } from './SearchFieldActions';
import { SEARCH_TERMS } from '@/lib/terms';

describe('SearchFieldActions', () => {
  it('shows a magnifying glass, and no button, when the box is empty', () => {
    const { container } = render(<SearchFieldActions hasText={false} loading={false} onClear={vi.fn()} />);
    expect(container.querySelector('svg.lucide-search')).not.toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows only an X button, and no magnifying glass, when the box has text', () => {
    const onClear = vi.fn();
    const { container } = render(<SearchFieldActions hasText loading={false} onClear={onClear} />);
    expect(container.querySelector('svg.lucide-search')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: SEARCH_TERMS.clear }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('shows the spinner in place of the magnifying glass while it loads', () => {
    const { container } = render(<SearchFieldActions hasText={false} loading onClear={vi.fn()} />);
    expect(container.querySelector('svg.animate-spin')).not.toBeNull();
    expect(container.querySelector('svg.lucide-search')).toBeNull();
  });

  it('keeps the X next to the spinner, so the user can still clear a slow search', () => {
    const { container } = render(<SearchFieldActions hasText loading onClear={vi.fn()} />);
    expect(container.querySelector('svg.animate-spin')).not.toBeNull();
    expect(screen.getByRole('button', { name: SEARCH_TERMS.clear })).toBeEnabled();
  });
});
